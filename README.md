# AI 写作工作室

基于 React + Tiptap + DeepSeek API 的本地写作应用，数据全部存储在浏览器 IndexedDB，无需后端。

---

## 技术栈

- **前端框架**：React 18 + TypeScript + Vite
- **富文本编辑器**：Tiptap
- **样式**：TailwindCSS
- **本地存储**：Dexie（IndexedDB 封装）
- **AI 接入**：DeepSeek API（OpenAI 兼容端点，浏览器直连）

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

浏览器访问 [http://localhost:5173](http://localhost:5173)

### 3. 构建生产版本

```bash
npm run build
```

构建产物在 `dist/` 目录，可直接双击 `dist/index.html` 打开（无需服务器）。

---

## 使用教程

### 第一步：配置 API Key

1. 打开应用后，点击左下角 **⚙ 设置**
2. 在 **DeepSeek API Key** 输入框中填入你的 Key（格式：`sk-...`）
   - 前往 [DeepSeek 开放平台](https://platform.deepseek.com) 注册并获取 API Key
3. 选择模型：
   - `DeepSeek Chat (V3)`：通用写作对话，响应快
   - `DeepSeek Reasoner (R1)`：深度推理，适合复杂改写任务
4. 选择写作风格偏好（影响 AI 的回复风格）
5. 点击 **保存**

> API Key 仅存储在本地浏览器 IndexedDB，不会上传到任何服务器。

---

### 第二步：创建章节

- 点击左侧侧边栏顶部的 **+ 新建章节**
- 在顶部标题栏输入章节名称
- 当章节标题为"未命名章节"时，编辑器会自动以内容首行（前 30 字）作为标题

---

### 第三步：写作

在主编辑区直接输入内容，支持以下格式：

| 操作 | 说明 |
|------|------|
| 工具栏按钮 | 加粗、斜体、H1/H2 标题、列表、引用 |
| 左侧列表 | 点击切换章节，悬停显示删除按钮 |
| 顶部搜索框 | 按标题或内容关键词筛选章节 |
| 字数统计 | 章节标题下方实时显示字数和修改时间 |

---

### 第四步：使用 AI 助手

#### 方式一：快捷键呼出

1. 在编辑器中**选中一段文字**
2. 按 `Ctrl+J`，AI 面板自动弹出，并带入选中内容
3. 在输入框描述需求，按 `Enter` 发送

#### 方式二：直接打开

1. 按 `Ctrl+J`（无需选中文字）
2. 在输入框输入任意写作需求

#### AI 面板操作

- `Enter`：发送消息
- `Shift+Enter`：输入框内换行
- **将最新回复插入编辑器**：点击对话下方的链接，将 AI 回复追加到当前章节末尾
- **✕**：关闭面板并清空本轮对话

#### 常用需求示例

```
帮我润色这段文字，保持原意但更流畅
续写这个场景，保持当前人物性格
给这段对话加上动作描写
把这段改写成第一人称
帮我检查语病和错别字
根据以下大纲，帮我扩写第二节
```

---

## 数据管理

所有数据（章节内容、设置、API Key）均存储在浏览器 IndexedDB 数据库 `WritingStudioDB` 中。

- **清除数据**：在浏览器开发者工具 → Application → IndexedDB → 删除 `WritingStudioDB`
- **数据迁移**：目前不支持导出，如需备份请手动复制章节内容

---

## 项目结构

```
src/
├── main.tsx                  # 入口
├── App.tsx                   # 主布局
├── index.css                 # 样式
├── components/
│   ├── Editor.tsx            # Tiptap 编辑器
│   ├── AIPanel.tsx           # AI 对话面板
│   └── Settings.tsx          # 设置面板
├── storage/
│   └── database.ts           # Dexie IndexedDB
└── agent/
    └── writingAgent.ts       # DeepSeek API 流式调用
```
