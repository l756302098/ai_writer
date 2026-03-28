import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Editor } from './components/Editor';
import { AIPanel } from './components/AIPanel';
import { Settings } from './components/Settings';
import { db, type Chapter } from './storage/database';

function wordCount(html: string): number {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [current, setCurrent] = useState<Chapter | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [search, setSearch] = useState('');

  const loadChapters = useCallback(async () => {
    const list = await db.getRecentChapters();
    setChapters(list);
  }, []);

  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  const createChapter = async () => {
    const chapter: Chapter = {
      id: uuidv4(),
      title: '未命名章节',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      wordCount: 0,
    };
    await db.chapters.add(chapter);
    await loadChapters();
    setCurrent(chapter);
  };

  const updateContent = async (html: string) => {
    if (!current) return;
    const wc = wordCount(html);
    const updated: Chapter = { ...current, content: html, wordCount: wc, updatedAt: Date.now() };

    // 自动从内容首行提取标题
    if (current.title === '未命名章节') {
      const firstLine = html.replace(/<[^>]*>/g, '').trim().split('\n')[0].slice(0, 30);
      if (firstLine) updated.title = firstLine;
    }

    await db.chapters.update(current.id, updated);
    setCurrent(updated);
    // 静默更新列表（不触发全量重新加载影响光标）
    setChapters(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const updateTitle = async (title: string) => {
    if (!current) return;
    const updated = { ...current, title, updatedAt: Date.now() };
    await db.chapters.update(current.id, { title });
    setCurrent(updated);
    setChapters(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const deleteChapter = async (id: string) => {
    if (!confirm('确认删除这个章节？')) return;
    await db.chapters.delete(id);
    if (current?.id === id) setCurrent(null);
    await loadChapters();
  };

  const insertText = (text: string) => {
    if (!current) return;
    const newContent = current.content + `<p>${text}</p>`;
    updateContent(newContent);
  };

  const filtered = search
    ? chapters.filter(c => c.title.includes(search) || c.content.includes(search))
    : chapters;

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* 侧边栏 */}
      <aside className="w-72 bg-white border-r flex flex-col shrink-0">
        <div className="p-3 border-b space-y-2">
          <button
            onClick={createChapter}
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 text-sm font-medium"
          >
            + 新建章节
          </button>
          <input
            type="text"
            placeholder="搜索章节..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <ul className="flex-1 overflow-y-auto">
          {filtered.map(ch => (
            <li
              key={ch.id}
              onClick={() => setCurrent(ch)}
              className={`group flex items-start justify-between px-3 py-2.5 border-b cursor-pointer hover:bg-gray-50 ${
                current?.id === ch.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">{ch.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(ch.updatedAt)} · {ch.wordCount} 字</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteChapter(ch.id); }}
                className="opacity-0 group-hover:opacity-100 ml-2 text-gray-300 hover:text-red-400 text-xs shrink-0 mt-0.5"
                title="删除"
              >
                ✕
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="text-center text-gray-400 text-sm mt-8">暂无章节</li>
          )}
        </ul>

        <div className="p-3 border-t">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full text-gray-500 py-1.5 rounded-lg hover:bg-gray-100 text-sm"
          >
            ⚙ 设置
          </button>
        </div>
      </aside>

      {/* 主编辑区 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {current ? (
          <>
            <header className="bg-white border-b px-6 py-3 shrink-0">
              <input
                type="text"
                value={current.title}
                onChange={e => updateTitle(e.target.value)}
                className="text-xl font-semibold w-full outline-none placeholder-gray-300"
                placeholder="章节标题"
              />
              <p className="text-xs text-gray-400 mt-1">{current.wordCount} 字 · {formatDate(current.updatedAt)}</p>
            </header>
            <div className="flex-1 overflow-y-auto p-6">
              <Editor
                content={current.content}
                onChange={updateContent}
                onSelectionChange={setSelectedText}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-lg mb-2">选择或新建一个章节开始写作</p>
              <button
                onClick={createChapter}
                className="text-blue-500 hover:underline text-sm"
              >
                新建章节
              </button>
            </div>
          </div>
        )}
      </main>

      {/* AI 面板 */}
      <AIPanel selectedText={selectedText} onInsertText={insertText} />

      {/* 设置面板 */}
      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
