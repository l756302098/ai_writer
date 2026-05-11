import { useState, useEffect, useRef, useCallback } from 'react';
import { streamChat, polishChapter, type ChatMessage } from '../agent/writingAgent';
import { db, type Character } from '../storage/database';

interface AIPanelProps {
  selectedText: string;
  chapterContent: string;
  chapterTitle: string;
  onInsertText: (text: string) => void;
  onReplaceContent: (html: string) => void;
}

type Mode = 'polish' | 'chat' | 'outline';

const POLISH_TEMPLATES = [
  { label: '语言流畅', desc: '优化句式结构，消除语病和冗余表达', instruction: '优化句式结构，让语言更加流畅自然，消除语病和冗余表达' },
  { label: '增强描写', desc: '丰富场景细节、动作描写和感官描述', instruction: '丰富场景细节、动作描写和感官描述，增强画面感' },
  { label: '人物对话', desc: '使对话更符合各角色的性格和说话风格', instruction: '让人物对话更符合各自的性格特点和说话风格' },
  { label: '节奏控制', desc: '调整段落长短和叙事节奏', instruction: '调整段落长短和叙事节奏，张弛有度' },
  { label: '语病检查', desc: '专注查找语法错误、错别字和标点问题', instruction: '检查并修正语法错误、错别字和标点问题' },
];

export function AIPanel({ selectedText, chapterContent, chapterTitle, onInsertText, onReplaceContent }: AIPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('polish');
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Polish mode state
  const [polishScope, setPolishScope] = useState<'chapter' | 'selection'>('chapter');
  const [customInstruction, setCustomInstruction] = useState('');
  const [activeTemplate, setActiveTemplate] = useState('');
  const [polishResult, setPolishResult] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [contextInfo, setContextInfo] = useState<{
    outlineTitle: string;
    siblingTitles: string[];
    characters: Character[];
    worldview: string;
  }>({ outlineTitle: '', siblingTitles: [], characters: [], worldview: '' });

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('open-ai-panel', handler);
    return () => window.removeEventListener('open-ai-panel', handler);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, streamBuffer]);

  // 加载润色上下文
  const loadPolishContext = useCallback(async () => {
    const [characters, worldview, outlineNodes] = await Promise.all([
      db.characters.toArray(),
      db.getWorldview(),
      db.getOutlineTree(),
    ]);

    const currentOutline = outlineNodes.find(n => n.chapterId === null);
    const siblings = outlineNodes
      .filter(n => n.parentId === (currentOutline?.parentId || null) && n.id !== currentOutline?.id)
      .map(n => n.title);

    setContextInfo({
      outlineTitle: chapterTitle || '当前章节',
      siblingTitles: siblings,
      characters,
      worldview: worldview.content || '',
    });
  }, [chapterTitle]);

  useEffect(() => {
    if (isOpen) loadPolishContext();
  }, [isOpen, loadPolishContext]);

  const selectTemplate = (label: string, instruction: string) => {
    setActiveTemplate(label);
    setCustomInstruction(instruction);
  };

  // 普通对话
  const handleChat = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const { apiKey, model } = await db.getSettings();
    if (!apiKey) { alert('请先在设置中配置 API Key'); return; }

    const userText = selectedText
      ? `针对以下选中文本：\n\n> ${selectedText}\n\n${trimmed}`
      : trimmed;

    const newHistory: ChatMessage[] = [...history, { role: 'user', content: userText }];
    setHistory(newHistory);
    setInput('');
    setStreaming(true);
    setStreamBuffer('');

    try {
      const fullText = await streamChat(apiKey, model, newHistory, (d) => {
        setStreamBuffer(prev => prev + d);
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

  // 润色模式发送
  const handlePolish = async () => {
    if (streaming) return;
    const { apiKey, model } = await db.getSettings();
    if (!apiKey) { alert('请先在设置中配置 API Key'); return; }

    const content = polishScope === 'selection' && selectedText ? selectedText : chapterContent;
    if (!content.trim()) { alert('没有可润色的内容'); return; }

    setStreaming(true);
    setPolishResult('');
    setShowDiff(false);

    try {
      const result = await polishChapter(apiKey, model, {
        chapterContent: content,
        outlineTitle: contextInfo.outlineTitle,
        siblingTitles: contextInfo.siblingTitles,
        characters: contextInfo.characters,
        worldview: contextInfo.worldview,
        customInstruction,
      }, (d) => {
        setPolishResult(prev => prev + d);
      });
      setPolishResult(result);
      setShowDiff(true);
    } catch (err) {
      setPolishResult(`调用失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (mode === 'polish') handlePolish();
      else handleChat();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setHistory([]);
    setInput('');
    setStreamBuffer('');
  };

  // 计算 diff 行
  const originalLines = (polishScope === 'selection' && selectedText ? selectedText : chapterContent).split('\n');
  const polishedLines = polishResult.split('\n');

  const renderDiff = () => {
    if (!showDiff || !polishResult) return null;
    return (
      <div className="flex-1 overflow-y-auto min-h-[200px] border rounded-lg">
        <div className="grid grid-cols-2 divide-x h-full">
          <div className="p-2">
            <p className="text-xs text-gray-400 mb-1 font-medium">原文</p>
            {originalLines.map((line, i) => {
              const isChanged = !polishedLines.some(pl => pl.trim() === line.trim());
              return (
                <div key={i} className={`text-xs py-0.5 ${isChanged ? 'bg-red-50 text-red-800' : 'text-gray-700'}`}>
                  {line || ' '}
                </div>
              );
            })}
          </div>
          <div className="p-2">
            <p className="text-xs text-gray-400 mb-1 font-medium">润色版</p>
            {polishedLines.map((line, i) => {
              const isNew = !originalLines.some(ol => ol.trim() === line.trim());
              return (
                <div key={i} className={`text-xs py-0.5 ${isNew ? 'bg-green-50 text-green-800' : 'text-gray-700'}`}>
                  {line || ' '}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 p-2 border-t bg-gray-50">
          <button
            onClick={() => { onReplaceContent(polishResult); setShowDiff(false); setPolishResult(''); }}
            className="flex-1 bg-blue-500 text-white py-1.5 rounded text-sm hover:bg-blue-600"
          >
            全部替换
          </button>
          <button
            onClick={() => { onInsertText(polishResult); setShowDiff(false); setPolishResult(''); }}
            className="px-3 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-100"
          >
            追加到下方
          </button>
          <button
            onClick={() => { setShowDiff(false); setPolishResult(''); }}
            className="px-3 py-1.5 border rounded text-sm text-gray-400 hover:bg-gray-100"
          >
            放弃
          </button>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[720px] max-w-[95vw] max-h-[85vh] flex flex-col shadow-2xl">
        {/* 标题栏 + 模式切换 */}
        <div className="flex justify-between items-center px-5 py-3 border-b">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['polish', 'chat'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setShowDiff(false); }}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  mode === m ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'polish' ? '✨ 润色' : '💬 对话'}
              </button>
            ))}
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* Polish Mode */}
        {mode === 'polish' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Scrollable config area */}
            <div className="overflow-y-auto flex-1">
              {/* Scope selection */}
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-medium text-gray-700 mb-2">润色范围</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPolishScope('chapter')}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${
                      polishScope === 'chapter' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    当前章节
                  </button>
                  <button
                    onClick={() => setPolishScope('selection')}
                    disabled={!selectedText}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${
                      polishScope === 'selection' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-gray-200 text-gray-500'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    选中文字{selectedText ? ` (${selectedText.length}字)` : ''}
                  </button>
                </div>
              </div>

              {/* Quick templates */}
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-medium text-gray-700 mb-2">快捷指令</p>
                <div className="flex flex-wrap gap-2">
                  {POLISH_TEMPLATES.map(t => (
                    <button
                      key={t.label}
                      onClick={() => selectTemplate(t.label, t.instruction)}
                      className={`px-3 py-1.5 rounded-full text-xs border ${
                        activeTemplate === t.label
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                      title={t.desc}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom instruction */}
              <div className="px-4 py-3 border-b">
                <textarea
                  value={customInstruction}
                  onChange={e => { setCustomInstruction(e.target.value); setActiveTemplate(''); }}
                  placeholder="自定义润色指令，如：让对话更加正式，增强紧张氛围..."
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              {/* Context display */}
              <div className="px-4 py-3">
                <p className="text-xs text-gray-400 mb-1">已携带上下文：</p>
                <ul className="text-xs text-gray-500 space-y-0.5">
                  <li>✓ 大纲：{contextInfo.outlineTitle}</li>
                  {contextInfo.characters.length > 0 && (
                    <li>✓ 关联人物：{contextInfo.characters.map(c => c.name).join('、')}</li>
                  )}
                  {contextInfo.worldview && (
                    <li>✓ 世界观摘要：{contextInfo.worldview.slice(0, 50)}...</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Diff view */}
            {renderDiff()}

            {/* Action button */}
            {!showDiff && (
              <div className="px-4 pb-4 pt-1 border-t">
                <button
                  onClick={handlePolish}
                  disabled={streaming}
                  className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 text-sm font-medium"
                >
                  {streaming ? '润色中...' : '开始润色'}
                </button>
              </div>
            )}

            {/* Streaming preview */}
            {streaming && polishResult && !showDiff && (
              <div className="px-4 pb-4">
                <div className="p-3 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {polishResult}
                  <span className="animate-pulse">█</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat Mode */}
        {mode === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Selected text tip */}
            {selectedText && (
              <div className="mx-4 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-gray-600">
                <span className="text-amber-600 font-medium">选中文本：</span>
                <span className="italic ml-1 line-clamp-2">{selectedText}</span>
              </div>
            )}

            {/* Chat history */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
              {history.length === 0 && !streaming && (
                <p className="text-gray-400 text-sm text-center mt-8">
                  输入你的写作需求，例如：帮我润色这段文字、续写这个场景、给点建议
                </p>
              )}
              {history.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {streaming && streamBuffer && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap bg-gray-100 text-gray-800">
                    {streamBuffer}
                    <span className="animate-pulse ml-0.5">█</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Insert button */}
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

            {/* Input */}
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
                onClick={handleChat}
                disabled={streaming || !input.trim()}
                className="px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 text-sm font-medium"
              >
                {streaming ? '...' : '发送'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
