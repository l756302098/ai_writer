import { useState, useEffect } from 'react';
import { db } from '../storage/database';
import { generateWorldview } from '../agent/writingAgent';

export function WorldviewPanel() {
  const [content, setContent] = useState('');
  const [keywords, setKeywords] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genText, setGenText] = useState('');

  useEffect(() => {
    db.getWorldview().then(w => setContent(w.content));
  }, []);

  const handleSave = async () => {
    await db.updateWorldview(content);
  };

  const handleGenerate = async () => {
    if (!keywords.trim() || generating) return;
    const { apiKey, model } = await db.getSettings();
    if (!apiKey) { alert('请先配置 API Key'); return; }

    setGenerating(true);
    setGenText('');
    try {
      const result = await generateWorldview(apiKey, model, keywords.trim(), (d) => {
        setGenText(prev => prev + d);
      });
      if (result) {
        setContent(result);
        await db.updateWorldview(result);
      }
    } catch (e) {
      alert(`生成失败：${e instanceof Error ? e.message : '未知'}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b space-y-2">
        <div className="flex gap-2">
          <input
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder="输入关键词，如：赛博朋克 + 东方玄幻"
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-300"
            onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !keywords.trim()}
            className="px-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 text-sm"
          >
            {generating ? '...' : '生成'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {generating && genText && (
          <div className="mb-3 p-3 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
            {genText}
            <span className="animate-pulse">█</span>
          </div>
        )}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          onBlur={handleSave}
          placeholder="在这里撰写故事的世界观设定，包括时代背景、地理环境、社会制度、科技/魔法体系等..."
          className="w-full h-full min-h-[300px] resize-none outline-none text-sm leading-relaxed"
        />
      </div>

      <div className="p-3 border-t text-xs text-gray-400 text-center">
        失焦自动保存 · 当前 {content.length} 字
      </div>
    </div>
  );
}
