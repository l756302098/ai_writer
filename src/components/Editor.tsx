import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';

interface EditorProps {
  content: string;
  onChange: (html: string) => void;
  onSelectionChange?: (text: string) => void;
}

export function Editor({ content, onChange, onSelectionChange }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始写作... 选中文字后按 Ctrl+J 呼出 AI 助手',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.ctrlKey && event.key === 'j') {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('open-ai-panel'));
          return true;
        }
        return false;
      },
    },
  });

  // 同步外部内容变化（切换章节时）
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  // 将选中文本上报给父组件
  useEffect(() => {
    if (!editor || !onSelectionChange) return;
    const handler = () => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      onSelectionChange(text);
    };
    editor.on('selectionUpdate', handler);
    return () => { editor.off('selectionUpdate', handler); };
  }, [editor, onSelectionChange]);

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      {/* 工具栏 */}
      <div className="tiptap-toolbar">
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={editor?.isActive('bold') ? 'is-active' : ''}
          title="粗体"
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={editor?.isActive('italic') ? 'is-active' : ''}
          title="斜体"
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
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor?.isActive('heading', { level: 2 }) ? 'is-active' : ''}
        >
          H2
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={editor?.isActive('bulletList') ? 'is-active' : ''}
        >
          • 列表
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          className={editor?.isActive('blockquote') ? 'is-active' : ''}
        >
          引用
        </button>
        <div className="flex-1" />
        <span className="text-xs text-gray-400 self-center pr-1">Ctrl+J 呼出 AI</span>
      </div>

      <EditorContent editor={editor} className="prose max-w-none" />
    </div>
  );
}
