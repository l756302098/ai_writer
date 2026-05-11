import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Editor } from './components/Editor';
import { AIPanel } from './components/AIPanel';
import { Settings } from './components/Settings';
import { OutlinePanel } from './components/OutlinePanel';
import { CharacterPanel } from './components/CharacterPanel';
import { WorldviewPanel } from './components/WorldviewPanel';
import { db, type Chapter } from './storage/database';

type SidebarTab = 'outline' | 'worldview' | 'characters';

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
  const [activeTab, setActiveTab] = useState<SidebarTab>('outline');

  const loadChapters = useCallback(async () => {
    const list = await db.getRecentChapters();
    setChapters(list);
  }, []);

  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  const createChapter = async (title?: string): Promise<Chapter> => {
    const chapter: Chapter = {
      id: uuidv4(),
      title: title || '未命名章节',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      wordCount: 0,
    };
    await db.chapters.add(chapter);
    await loadChapters();
    return chapter;
  };

  const handleSelectChapter = async (chapterId: string | null, title: string) => {
    if (chapterId) {
      const ch = chapters.find(c => c.id === chapterId);
      if (ch) { setCurrent(ch); return; }
    }
    // 创建新章节并关联到此大纲节点
    const newChapter = await createChapter(title);
    setCurrent(newChapter);
  };

  const updateContent = async (html: string) => {
    if (!current) return;
    const wc = wordCount(html);
    const updated: Chapter = { ...current, content: html, wordCount: wc, updatedAt: Date.now() };

    if (current.title === '未命名章节') {
      const firstLine = html.replace(/<[^>]*>/g, '').trim().split('\n')[0].slice(0, 30);
      if (firstLine) updated.title = firstLine;
    }

    await db.chapters.update(current.id, updated);
    setCurrent(updated);
    setChapters(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const updateTitle = async (title: string) => {
    if (!current) return;
    await db.chapters.update(current.id, { title, updatedAt: Date.now() });
    setCurrent({ ...current, title, updatedAt: Date.now() });
    setChapters(prev => prev.map(c => c.id === current.id ? { ...c, title } : c));
  };

  const insertText = (text: string) => {
    if (!current) return;
    const newContent = current.content + `<p>${text}</p>`;
    updateContent(newContent);
  };

  const replaceContent = (html: string) => {
    if (!current) return;
    updateContent(html);
  };

  const filtered = search
    ? chapters.filter(c => c.title.includes(search) || c.content.includes(search))
    : chapters;

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* 左侧导航栏 */}
      <aside className="w-72 bg-white border-r flex flex-col shrink-0">
        {/* Tab switching */}
        <div className="flex border-b bg-gray-50">
          {([
            ['outline', '大纲'],
            ['worldview', '世界观'],
            ['characters', '人物'],
          ] as [SidebarTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'text-blue-600 border-b-2 border-blue-500 bg-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'outline' && (
            <OutlinePanel
              activeChapterId={current?.id || null}
              onSelectChapter={handleSelectChapter}
            />
          )}
          {activeTab === 'worldview' && (
            <WorldviewPanel />
          )}
          {activeTab === 'characters' && (
            <CharacterPanel chapterContent={current?.content || ''} />
          )}
        </div>

        {/* Bottom bar */}
        <div className="p-3 border-t space-y-2">
          {/* Chapter quick nav (compact) */}
          <div className="relative">
            <input
              type="text"
              placeholder="搜索章节..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-300"
            />
            {search && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filtered.slice(0, 10).map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => { setCurrent(ch); setSearch(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
                  >
                    <span className="truncate block">{ch.title}</span>
                    <span className="text-xs text-gray-400">{formatDate(ch.updatedAt)} · {ch.wordCount} 字</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-2">无匹配章节</p>
                )}
              </div>
            )}
          </div>
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
              <p className="text-lg mb-2">从左侧大纲中选择一个章节开始写作</p>
              <p className="text-sm text-gray-300">或按 Ctrl+J 呼出 AI 助手</p>
            </div>
          </div>
        )}
      </main>

      {/* AI 面板 (modal) */}
      <AIPanel
        selectedText={selectedText}
        chapterContent={current?.content || ''}
        chapterTitle={current?.title || ''}
        onInsertText={insertText}
        onReplaceContent={replaceContent}
      />

      {/* 设置面板 */}
      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
