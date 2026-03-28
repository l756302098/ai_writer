import { useState, useEffect } from 'react';
import { db, type WritingSettings } from '../storage/database';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEEPSEEK_MODELS = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat (V3，通用对话)' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1，深度推理)' },
];

const STYLE_OPTIONS: { value: WritingSettings['style']; label: string }[] = [
  { value: 'casual', label: '轻松自然' },
  { value: 'formal', label: '正式严谨' },
  { value: 'literary', label: '文学性' },
  { value: 'concise', label: '简洁精炼' },
];

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek-chat');
  const [style, setStyle] = useState<WritingSettings['style']>('casual');
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      db.getSettings().then(s => {
        setApiKey(s.apiKey);
        setModel(s.model);
        setStyle(s.style);
      });
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    await db.updateSettings({ apiKey, model, style });
    setSaving(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[480px] max-w-[95vw] shadow-2xl">
        <div className="flex justify-between items-center px-5 py-3 border-b">
          <span className="font-semibold text-gray-700">设置</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              DeepSeek API Key
            </label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="px-3 border rounded-lg text-sm text-gray-500 hover:bg-gray-50"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              API Key 仅存储在本地浏览器 IndexedDB，不会上传到任何服务器。
            </p>
          </div>

          {/* 模型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
            >
              {DEEPSEEK_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* 写作风格 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">写作风格</label>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStyle(opt.value)}
                  className={`py-2 rounded-lg text-sm border transition-colors ${
                    style === opt.value
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 font-medium"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
