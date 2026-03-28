# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a design specification repository for **AI 写作工作室** (AI Writing Studio) — a local-first, browser-based writing app powered by AI. No backend is required. All data stays in the user's browser (IndexedDB).

## Planned Tech Stack

- **Frontend**: React + Vite + TailwindCSS
- **Editor**: Tiptap (rich text, `@tiptap/react` + `@tiptap/starter-kit`)
- **AI Agent**: `@mariozechner/pi-agent-core` (pi-mono framework)
- **Storage**: Dexie (IndexedDB wrapper)
- **Build**: Vite with `base: './'` so the built output can be opened directly as a local file

## Design Documents

- `Writer.MD` — Core writing agent design: tools (`generate_outline`, `write_chapter`, `polish_text`, `search_reference`, `save_version`), the `WritingAgent` class, and advanced features (style learning, roleplay modes, multimodal).
- `Writer_Frame.MD` — Full web app implementation blueprint: project setup commands, Vite config, Dexie schema, all React component source code (`Editor`, `AIPanel`, `Settings`, `App`), and deployment instructions.

## Architecture

```
Browser (local)
├── React App (Vite)
│   ├── App.tsx            — chapter list sidebar + main editor layout
│   ├── components/
│   │   ├── Editor.tsx     — Tiptap editor; Ctrl+J triggers AI panel
│   │   ├── AIPanel.tsx    — floating AI chat panel, streams responses
│   │   └── Settings.tsx   — API key, model, style preferences
│   ├── storage/
│   │   └── database.ts    — Dexie schema: chapters, characters, locations, settings
│   └── agent/
│       └── writingAgent.ts — creates pi-mono Agent with worldview context injected into system prompt
```

## Key Design Decisions

- **API key stored locally**: User enters their own API key; it is stored only in IndexedDB, never sent to any server other than the AI provider.
- **Agent tools are prompt bridges**: The browser-side tool `execute` functions don't call LLMs directly — they return formatted prompts that the agent's LLM then processes.
- **Context management**: Long writing sessions risk exceeding context windows; the design recommends periodic summarization and `thinkingLevel: "minimal"` to reduce overhead.
- **Ctrl+J shortcut**: Selects text in the editor and opens the AI panel with that text pre-loaded.
- **Auto-title**: When a chapter is still named "未命名章节", the first 30 characters of content become the title automatically.

## Commands (once the project is initialized)

```bash
npm install       # install dependencies
npm run dev       # dev server at http://localhost:5173
npm run build     # build to dist/
npm run preview   # preview the build locally
```

To open the built app without a server: open `dist/index.html` directly in the browser (works because `base: './'` is set in Vite config).
