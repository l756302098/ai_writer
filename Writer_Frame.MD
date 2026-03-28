## 纯 Web 应用 + 本地部署：完整实现路径

这是一个典型的场景——**用户在自己的电脑上运行，数据完全本地化，无需云端部署**。

---

## 一、架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    用户本地电脑                                  │
├─────────────────────────────────────────────────────────────────┤
│  方式1: 直接打开 HTML 文件                                       │
│  file:///path/to/index.html                                    │
│                    ↓                                            │
│  方式2: 本地 HTTP 服务器                                         │
│  http://localhost:5173                                         │
├─────────────────────────────────────────────────────────────────┤
│  浏览器环境                                                     │
│  ├── React + Tiptap 编辑器                                      │
│  ├── pi-mono Agent（纯前端运行）                                │
│  ├── IndexedDB（本地存储）                                      │
│  └── 调用 AI API（用户自己的 API Key）                          │
└─────────────────────────────────────────────────────────────────┘
```

**核心特点**：
- ✅ 无需任何后端服务器
- ✅ 数据存储在浏览器 IndexedDB
- ✅ AI 调用使用用户自己的 API Key
- ✅ 可离线使用（除了 AI 调用需要网络）

---

## 二、项目初始化

### 2.1 创建项目

```bash
# 创建项目目录
mkdir writing-studio-local
cd writing-studio-local

# 初始化 package.json
npm init -y

# 安装依赖
npm install react react-dom @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
npm install dexie
npm install @mariozechner/pi-agent-core @mariozechner/pi-ai
npm install uuid

# 开发依赖
npm install -D @types/react @types/react-dom @types/uuid
npm install -D vite @vitejs/plugin-react
npm install -D tailwindcss postcss autoprefixer
```

### 2.2 配置 Vite

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 关键配置：确保构建后可以本地打开
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    port: 5173,
    open: true
  }
});
```

### 2.3 TailwindCSS 配置

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Tiptap 编辑器样式 */
.ProseMirror {
  @apply min-h-[500px] outline-none p-4;
}

.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  @apply text-gray-400 float-left h-0 pointer-events-none;
}

/* 工具栏样式 */
.tiptap-toolbar {
  @apply border-b border-gray-200 p-2 flex gap-1;
}

.tiptap-toolbar button {
  @apply p-2 rounded hover:bg-gray-100 transition;
}

.tiptap-toolbar button.is-active {
  @apply bg-gray-200;
}
```

---

## 三、IndexedDB 存储层

```typescript
// src/storage/database.ts
import Dexie, { Table } from 'dexie';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  wordCount: number;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  traits: string[];
  createdAt: number;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

export interface WritingSettings {
  id: 'app_settings';
  apiKey: string;
  model: string;
  style: 'formal' | 'casual' | 'literary' | 'concise';
}

export class WritingDatabase extends Dexie {
  chapters!: Table<Chapter, string>;
  characters!: Table<Character, string>;
  locations!: Table<Location, string>;
  settings!: Table<WritingSettings, string>;

  constructor() {
    super('WritingStudioDB');
    
    this.version(1).stores({
      chapters: 'id, title, updatedAt',
      characters: 'id, name',
      locations: 'id, name',
      settings: 'id'
    });
  }

  // 获取最近章节
  async getRecentChapters(limit: number = 10): Promise<Chapter[]> {
    return await this.chapters
      .orderBy('updatedAt')
      .reverse()
      .limit(limit)
      .toArray();
  }

  // 获取设置
  async getSettings(): Promise<WritingSettings> {
    let settings = await this.settings.get('app_settings');
    if (!settings) {
      settings = {
        id: 'app_settings',
        apiKey: '',
        model: 'claude-sonnet-4',
        style: 'casual'
      };
      await this.settings.add(settings);
    }
    return settings;
  }

  async updateSettings(settings: Partial<WritingSettings>) {
    const current = await this.getSettings();
    await this.settings.put({ ...current, ...settings });
  }
}

export const db = new WritingDatabase();
```

---

## 四、Tiptap 编辑器组件

```tsx
// src/components/Editor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onSelectionChange?: (selectedText: string) => void;
}

export function Editor({ content, onChange, onSelectionChange }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始写作... (选中文字后可按 Ctrl+J 呼出 AI)',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        // Ctrl+J 呼出 AI
        if (event.ctrlKey && event.key === 'j') {
          event.preventDefault();
          const { state } = view;
          const { from, to } = state.selection;
          const selectedText = state.doc.textBetween(from, to, ' ');
          if (selectedText && onSelectionChange) {
            onSelectionChange(selectedText);
          }
          window.dispatchEvent(new CustomEvent('open-ai-panel'));
          return true;
        }
        return false;
      },
    },
  });

  // 监听选区变化
  useEffect(() => {
    if (!editor) return;
    
    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, ' ');
      if (selectedText && onSelectionChange) {
        onSelectionChange(selectedText);
      }
    };
    
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, onSelectionChange]);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* 工具栏 */}
      <div className="tiptap-toolbar">
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={editor?.isActive('bold') ? 'is-active' : ''}
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={editor?.isActive('italic') ? 'is-active' : ''}
        >
          <em>I</em>
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor?.isActive('heading', { level: 1 }) ? 'is-active' : ''}
        >
          H1
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={editor?.isActive('bulletList') ? 'is-active' : ''}
        >
          • 列表
        </button>
        <div className="flex-1" />
        <span className="text-xs text-gray-400">
          Ctrl+J 呼出 AI
        </span>
      </div>
      
      <EditorContent editor={editor} className="prose max-w-none" />
    </div>
  );
}
```

---

## 五、pi-mono Agent 服务

```typescript
// src/agent/writingAgent.ts
import { Agent } from '@mariozechner/pi-agent-core';
import { db } from '../storage/database';

// 自定义写作工具
export const writingTools = [
  {
    name: 'polish_text',
    label: '润色文本',
    description: '改进文本的表达、语法和风格',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待润色的文本' },
        style: { type: 'string', enum: ['formal', 'casual', 'literary', 'concise'] }
      },
      required: ['text']
    },
    async execute(_id: string, params: any) {
      // 注意：这里实际应该调用 LLM
      // 由于工具函数在浏览器中执行，可以直接返回提示
      // 实际润色逻辑在系统提示词中由 AI 完成
      return {
        content: [{ 
          type: 'text', 
          text: `请帮我润色以下文本（${params.style}风格）：\n\n${params.text}` 
        }]
      };
    }
  },
  {
    name: 'expand_outline',
    label: '扩写大纲',
    description: '根据大纲生成详细内容',
    parameters: {
      type: 'object',
      properties: {
        outline: { type: 'string', description: '章节大纲' }
      },
      required: ['outline']
    },
    async execute(_id: string, params: any) {
      return {
        content: [{ 
          type: 'text', 
          text: `请根据以下大纲扩写内容：\n\n${params.outline}` 
        }]
      };
    }
  }
];

// 从 IndexedDB 获取世界观上下文
async function buildWorldviewContext(): Promise<string> {
  const characters = await db.characters.toArray();
  const locations = await db.locations.toArray();
  
  if (characters.length === 0 && locations.length === 0) {
    return '';
  }
  
  let context = '## 故事设定\n\n';
  
  if (characters.length > 0) {
    context += '### 人物\n';
    characters.forEach(c => {
      context += `- **${c.name}**：${c.description}\n`;
    });
    context += '\n';
  }
  
  if (locations.length > 0) {
    context += '### 地点\n';
    locations.forEach(l => {
      context += `- **${l.name}**：${l.description}\n`;
    });
  }
  
  return context;
}

// 创建 Agent
export async function createWritingAgent(apiKey: string, model: string) {
  const worldview = await buildWorldviewContext();
  const settings = await db.getSettings();
  
  const systemPrompt = `
你是一个专业的写作助手，帮助作者进行创作。

${worldview}

写作风格偏好：${settings.style}

你的能力：
1. 协助构思故事大纲
2. 润色和修改文本
3. 提供写作建议
4. 保持人物和世界观的一致性

请用友好、鼓励的语气与用户交流。
  `;
  
  const agent = new Agent({
    getApiKey: () => apiKey,
    initialState: {
      systemPrompt,
      model: model,
      thinkingLevel: 'medium',
      tools: writingTools,
      messages: [],
      isStreaming: true,
      streamMessage: null,
      pendingToolCalls: new Set(),
    },
  });
  
  return agent;
}
```

---

## 六、AI 对话面板组件

```tsx
// src/components/AIPanel.tsx
import { useState, useEffect } from 'react';
import { createWritingAgent } from '../agent/writingAgent';
import { db } from '../storage/database';

interface AIPanelProps {
  selectedText?: string;
  onInsertText: (text: string) => void;
}

export function AIPanel({ selectedText = '', onInsertText }: AIPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState({ apiKey: '', model: '' });

  useEffect(() => {
    loadSettings();
    
    // 监听全局事件
    const handler = () => setIsOpen(true);
    window.addEventListener('open-ai-panel', handler);
    return () => window.removeEventListener('open-ai-panel', handler);
  }, []);

  const loadSettings = async () => {
    const settings = await db.getSettings();
    setSettings(settings);
  };

  const handleSubmit = async () => {
    if (!settings.apiKey) {
      alert('请先在设置中配置 API Key');
      return;
    }
    
    setIsStreaming(true);
    setResponse('');
    
    try {
      const agent = await createWritingAgent(settings.apiKey, settings.model);
      
      let fullResponse = '';
      
      agent.subscribe((event: any) => {
        if (event.type === 'message_update') {
          const ae = event.assistantMessageEvent;
          if (ae.type === 'text_delta') {
            fullResponse += ae.delta;
            setResponse(fullResponse);
          }
        }
      });
      
      const finalPrompt = selectedText 
        ? `针对选中的文本：\n\n${selectedText}\n\n${prompt}`
        : prompt;
      
      await agent.prompt(finalPrompt);
    } catch (error) {
      console.error('AI 调用失败:', error);
      setResponse('调用失败，请检查 API Key 是否正确');
    } finally {
      setIsStreaming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[600px] max-w-[90vw] shadow-xl">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold">AI 写作助手</h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        
        <div className="p-4">
          {selectedText && (
            <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
              <div className="text-gray-500 mb-1">选中文本：</div>
              <div className="italic">{selectedText}</div>
            </div>
          )}
          
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="输入你的写作需求... 例如：帮我润色这段文字、续写这个场景、给点写作建议"
            className="w-full p-3 border rounded-lg resize-none"
            rows={3}
          />
          
          <div className="mt-4">
            {response && (
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <div className="text-gray-500 mb-1">AI 回复：</div>
                <div className="whitespace-pre-wrap">
                  {response}
                  {isStreaming && <span className="animate-pulse">█</span>}
                </div>
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={isStreaming || !prompt}
              className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:bg-gray-300"
            >
              {isStreaming ? '生成中...' : '发送'}
            </button>
            {response && (
              <button
                onClick={() => {
                  onInsertText(response);
                  setIsOpen(false);
                }}
                className="px-4 bg-green-500 text-white rounded hover:bg-green-600"
              >
                插入到编辑器
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 七、设置面板组件

```tsx
// src/components/Settings.tsx
import { useState, useEffect } from 'react';
import { db } from '../storage/database';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [style, setStyle] = useState<'formal' | 'casual' | 'literary' | 'concise'>('casual');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    const settings = await db.getSettings();
    setApiKey(settings.apiKey);
    setModel(settings.model);
    setStyle(settings.style);
  };

  const handleSave = async () => {
    setSaving(true);
    await db.updateSettings({ apiKey, model, style });
    setSaving(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[500px] max-w-[90vw]">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold">设置</h3>
          <button onClick={onClose} className="text-gray-500">✕</button>
        </div>
        
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-xxx..."
              className="w-full p-2 border rounded"
            />
            <p className="text-xs text-gray-500 mt-1">
              你的 API Key 只存储在本地浏览器中，不会上传到任何服务器
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">模型</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="claude-sonnet-4">Claude Sonnet 4</option>
              <option value="claude-opus-4">Claude Opus 4</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="deepseek-chat">DeepSeek Chat</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">写作风格</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as any)}
              className="w-full p-2 border rounded"
            >
              <option value="formal">正式</option>
              <option value="casual">轻松</option>
              <option value="literary">文学性</option>
              <option value="concise">简洁</option>
            </select>
          </div>
        </div>
        
        <div className="flex gap-2 p-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 八、主应用组件

```tsx
// src/App.tsx
import { useState, useEffect } from 'react';
import { Editor } from './components/Editor';
import { AIPanel } from './components/AIPanel';
import { Settings } from './components/Settings';
import { db, Chapter } from './storage/database';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => {
    loadChapters();
  }, []);

  const loadChapters = async () => {
    const list = await db.getRecentChapters(50);
    setChapters(list);
    if (list.length > 0 && !currentChapter) {
      setCurrentChapter(list[0]);
    }
  };

  const createNewChapter = async () => {
    const newChapter: Chapter = {
      id: uuidv4(),
      title: '未命名章节',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      wordCount: 0
    };
    await db.chapters.add(newChapter);
    await loadChapters();
    setCurrentChapter(newChapter);
  };

  const updateChapter = async (content: string) => {
    if (!currentChapter) return;
    
    const wordCount = content.replace(/<[^>]*>/g, '').length;
    const updated: Chapter = {
      ...currentChapter,
      content,
      wordCount,
      updatedAt: Date.now()
    };
    await db.chapters.update(currentChapter.id, updated);
    setCurrentChapter(updated);
    
    // 更新列表中的标题
    const firstLine = content.replace(/<[^>]*>/g, '').split('\n')[0].slice(0, 30);
    if (firstLine && currentChapter.title === '未命名章节') {
      await db.chapters.update(currentChapter.id, { title: firstLine });
      await loadChapters();
    }
  };

  const deleteChapter = async (id: string) => {
    await db.chapters.delete(id);
    if (currentChapter?.id === id) {
      setCurrentChapter(null);
    }
    await loadChapters();
  };

  const filteredChapters = searchKeyword
    ? chapters.filter(c => c.title.includes(searchKeyword))
    : chapters;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* 侧边栏 */}
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <button
            onClick={createNewChapter}
            className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
          >
            + 新建章节
          </button>
          <input
            type="text"
            placeholder="搜索章节..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full mt-3 p-2 border rounded"
          />
        </div>
        
        <div className="flex-1 overflow-auto">
          {filteredChapters.map(chapter => (
            <div
              key={chapter.id}
              className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                currentChapter?.id === chapter.id ? 'bg-blue-50' : ''
              }`}
              onClick={() => setCurrentChapter(chapter)}
            >
              <div className="font-medium truncate">{chapter.title}</div>
              <div className="text-xs text-gray-500">
                {new Date(chapter.updatedAt).toLocaleString()} · {chapter.wordCount}字
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full text-gray-600 py-2 rounded hover:bg-gray-100"
          >
            ⚙️ 设置
          </button>
        </div>
      </div>
      
      {/* 主编辑区 */}
      <div className="flex-1 flex flex-col">
        {currentChapter ? (
          <>
            <div className="bg-white border-b p-4">
              <input
                type="text"
                value={currentChapter.title}
                onChange={(e) => {
                  const updated = { ...currentChapter, title: e.target.value };
                  setCurrentChapter(updated);
                  db.chapters.update(currentChapter.id, { title: e.target.value });
                }}
                className="text-xl font-semibold w-full outline-none"
                placeholder="章节标题"
              />
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              <Editor
                content={currentChapter.content}
                onChange={updateChapter}
                onSelectionChange={setSelectedText}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            选择或创建一个章节开始写作
          </div>
        )}
      </div>
      
      {/* AI 面板 */}
      <AIPanel selectedText={selectedText} onInsertText={(text) => {
        // 插入到编辑器
        const newContent = currentChapter?.content + `<p>${text}</p>`;
        if (newContent) updateChapter(newContent);
      }} />
      
      {/* 设置面板 */}
      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

export default App;
```

---

## 九、启动文件

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI 写作工作室</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```json
// package.json scripts
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

## 十、本地部署使用方式

### 方式1：开发模式运行

```bash
npm run dev
# 浏览器自动打开 http://localhost:5173
```

### 方式2：构建后本地打开

```bash
npm run build
# 生成 dist/ 目录

# 方式 A：直接用浏览器打开
# 双击 dist/index.html

# 方式 B：用本地服务器
npx serve dist
# 或
python -m http.server 3000 -d dist
```

### 方式3：打包成可执行文件（可选）

如果希望给用户一个双击就能运行的文件，可以使用 **WebView2** 或 **Neutralinojs** 包装：

```bash
# 使用 Neutralinojs 打包
npm install -g @neutralinojs/neu
neu build
# 生成 .exe / .app 文件
```

---

## 十一、项目结构总览

```
writing-studio-local/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   ├── Editor.tsx
│   │   ├── AIPanel.tsx
│   │   └── Settings.tsx
│   ├── storage/
│   │   └── database.ts
│   └── agent/
│       └── writingAgent.ts
```

---

## 十二、启动测试

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 浏览器打开 http://localhost:5173
# 1. 点击设置，配置你的 API Key
# 2. 新建章节，开始写作
# 3. 选中文字，按 Ctrl+J 呼出 AI 助手
```

**核心优势总结**：
- ✅ 纯前端，无需任何后端
- ✅ 数据完全在本地 IndexedDB
- ✅ AI 调用使用用户自己的 API Key
- ✅ 双击 HTML 文件或在本地服务器运行
- ✅ 所有数据用户自己掌控