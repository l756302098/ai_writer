import { useState, useEffect, useRef } from 'react';
import { streamChat, type ChatMessage } from '../agent/writingAgent';
import { db } from '../storage/database';

interface AIPanelProps {
  selectedText: string;
  onInsertText: (text: string) => void;
}

export function AIPanel({ selectedText, onInsertText }: AIPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // 监听全局事件（Ctrl+J）
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('open-ai-panel', handler);
    return () => window.removeEventListener('open-ai-panel', handler);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, streamBuffer]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const { apiKey, model } = await db.getSettings();
    if (!apiKey) {
      alert('请先在设置中配置 API Key');
      return;
    }

    // 如果有选中文本，拼接到用户消息中
    const userText = selectedText
      ? `针对以下选中文本：\n\n> ${selectedText}\n\n${trimmed}`
      : trimmed;

    const newHistory: ChatMessage[] = [...history, { role: 'user', content: userText }];
    setHistory(newHistory);
    setInput('');
    setStreaming(true);
    setStreamBuffer('');

    try {
      const fullText = await streamChat(apiKey, model, newHistory, (delta) => {
        setStreamBuffer(prev => prev + delta);
      });
      setHistory([...newHistory, { role: 'assistant', content: fullText }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setHistory([...newHistory, { role: 'assistant', content: `调用失败：${msg}` }]);
    } finally {
      setStreaming(false);
      setStreamBuffer('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setHistory([]);
    setInput('');
    setStreamBuffer('');
  };

  if (!isOpen) return null;

  // 渲染消息列表，streaming 时末尾追加流式内容
  const displayMessages: ChatMessage[] = streaming
    ? [...history, { role: 'assistant', content: streamBuffer }]
    : history;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[640px] max-w-[95vw] max-h-[80vh] flex flex-col shadow-2xl">
        {/* 标题栏 */}
        <div className="flex justify-between items-center px-5 py-3 border-b">
          <span className="font-semibold text-gray-700">AI 写作助手</span>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* 选中文本提示 */}
        {selectedText && (
          <div className="mx-4 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-gray-600">
            <span className="text-amber-600 font-medium">选中文本：</span>
            <span className="italic ml-1 line-clamp-2">{selectedText}</span>
          </div>
        )}

        {/* 对话历史 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
          {displayMessages.length === 0 && (
            <p className="text-gray-400 text-sm text-center mt-8">
              输入你的写作需求，例如：帮我润色这段文字、续写这个场景、给点建议
            </p>
          )}
          {displayMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.content}
                {streaming && i === displayMessages.length - 1 && msg.role === 'assistant' && (
                  <span className="animate-pulse ml-0.5">█</span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* 最后一条 AI 回复可插入编辑器 */}
        {!streaming && history.length > 0 && history[history.length - 1].role === 'assistant' && (
          <div className="px-4 pb-2">
            <button
              onClick={() => {
                const last = history[history.length - 1];
                onInsertText(last.content);
                handleClose();
              }}
              className="text-xs text-green-600 hover:text-green-800 underline"
            >
              将最新回复插入编辑器
            </button>
          </div>
        )}

        {/* 输入区 */}
        <div className="px-4 pb-4 pt-1 border-t flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入需求... Enter 发送，Shift+Enter 换行"
            rows={2}
            className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 text-sm font-medium"
          >
            {streaming ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
