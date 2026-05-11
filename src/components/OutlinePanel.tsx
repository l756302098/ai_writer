import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db, type OutlineNode } from '../storage/database';
import { generateOutline } from '../agent/writingAgent';

interface OutlinePanelProps {
  activeChapterId: string | null;
  onSelectChapter: (chapterId: string | null, title: string) => void;
}

export function OutlinePanel({ activeChapterId, onSelectChapter }: OutlinePanelProps) {
  const [nodes, setNodes] = useState<OutlineNode[]>([]);
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<Map<string, 'new' | 'modified' | 'deleted'>>(new Map());

  useEffect(() => {
    loadNodes();
  }, []);

  const loadNodes = async () => {
    const list = await db.getOutlineTree();
    setNodes(list);
  };

  const roots = nodes.filter(n => !n.parentId);

  const getChildren = (parentId: string) =>
    nodes.filter(n => n.parentId === parentId).sort((a, b) => a.order - b.order);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!description.trim() || generating) return;
    const { apiKey, model } = await db.getSettings();
    if (!apiKey) { alert('请先配置 API Key'); return; }

    setGenerating(true);
    setGenProgress('正在生成大纲...');
    try {
      const result = await generateOutline(apiKey, model, description.trim(), nodes, (d) => {
        setGenProgress(prev => prev + d);
      });

      if (result.length === 0) {
        setGenProgress('生成失败，请重试');
        return;
      }

      const newNodes: OutlineNode[] = [];
      const existingIds = new Set(nodes.map(n => n.id));
      const newHighlights = new Map<string, 'new' | 'modified' | 'deleted'>();

      let order = 0;
      for (const item of result) {
        let isNew = item.title.includes('[新增]');
        let isModified = item.title.includes('[修改]');
        const cleanTitle = item.title.replace(/\[新增\]|\[修改\]/g, '').trim();

        const existing = nodes.find(n => !n.parentId && n.title === cleanTitle);
        const parentId = existing?.id || uuidv4();
        const chapterId = existing?.chapterId || null;

        if (!existing) {
          newNodes.push({
            id: parentId,
            parentId: null,
            title: cleanTitle,
            order: order++,
            chapterId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          isNew = true;
        }

        if (isNew) newHighlights.set(parentId, 'new');
        else if (isModified) newHighlights.set(parentId, 'modified');
        existingIds.delete(parentId);

        let childOrder = 0;
        for (const child of item.children) {
          let childNew = child.title.includes('[新增]');
          let childModified = child.title.includes('[修改]');
          const childClean = child.title.replace(/\[新增\]|\[修改\]/g, '').trim();

          const childExisting = nodes.find(
            n => n.parentId === parentId && n.title === childClean
          );
          const childId = childExisting?.id || uuidv4();

          if (!childExisting) {
            newNodes.push({
              id: childId,
              parentId,
              title: childClean,
              order: childOrder++,
              chapterId: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            childNew = true;
          }

          if (childNew) newHighlights.set(childId, 'new');
          else if (childModified) newHighlights.set(childId, 'modified');
          existingIds.delete(childId);
        }
      }

      // Mark deleted
      for (const id of existingIds) {
        newHighlights.set(id, 'deleted');
      }

      // Save
      if (newNodes.length > 0) await db.outlineNodes.bulkAdd(newNodes);
      // Update existing nodes that got modified
      for (const [id, status] of newHighlights) {
        if (status === 'modified') {
          await db.outlineNodes.update(id, { updatedAt: Date.now() });
        }
      }

      setHighlighted(newHighlights);
      setTimeout(() => setHighlighted(new Map()), 3000);

      await loadNodes();
      setGenProgress('');

      // Auto-delete after delay
      setTimeout(async () => {
        for (const [id, status] of newHighlights) {
          if (status === 'deleted') {
            await db.outlineNodes.delete(id);
          }
        }
        await loadNodes();
      }, 10000);
    } catch (e) {
      setGenProgress(`错误：${e instanceof Error ? e.message : '未知'}`);
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = (node: OutlineNode) => {
    setEditingId(node.id);
    setEditTitle(node.title);
  };

  const commitEdit = async (id: string) => {
    if (editTitle.trim()) {
      await db.outlineNodes.update(id, { title: editTitle.trim(), updatedAt: Date.now() });
      await loadNodes();
    }
    setEditingId(null);
  };

  const deleteNode = async (id: string) => {
    const toDelete = [id];
    const children = nodes.filter(n => n.parentId === id);
    for (const c of children) toDelete.push(c.id);
    await db.outlineNodes.bulkDelete(toDelete);
    await loadNodes();
  };

  const addChild = async (parentId: string) => {
    const siblings = nodes.filter(n => n.parentId === parentId);
    const node: OutlineNode = {
      id: uuidv4(),
      parentId,
      title: '新小节',
      order: siblings.length,
      chapterId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.outlineNodes.add(node);
    await loadNodes();
    setExpanded(prev => new Set([...prev, parentId]));
    setEditingId(node.id);
    setEditTitle('新小节');
  };

  const addRoot = async () => {
    const siblings = nodes.filter(n => !n.parentId);
    const node: OutlineNode = {
      id: uuidv4(),
      parentId: null,
      title: '新章节',
      order: siblings.length,
      chapterId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.outlineNodes.add(node);
    await loadNodes();
    setEditingId(node.id);
    setEditTitle('新章节');
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const dragId = e.dataTransfer.getData('text/plain');
    if (dragId === targetId) return;

    const target = nodes.find(n => n.id === targetId);
    if (!target) return;

    await db.outlineNodes.update(dragId, {
      parentId: target.parentId,
      order: target.order,
    });

    // Reorder siblings
    const siblings = nodes
      .filter(n => n.parentId === target.parentId && n.id !== dragId)
      .sort((a, b) => a.order - b.order);

    for (let i = 0; i < siblings.length; i++) {
      await db.outlineNodes.update(siblings[i].id, { order: i });
    }

    await loadNodes();
  };

  const handleUndoDelete = async (id: string) => {
    setHighlighted(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const renderNode = (node: OutlineNode, depth: number) => {
    const isExpanded = expanded.has(node.id);
    const hasChildren = nodes.some(n => n.parentId === node.id);
    const hl = highlighted.get(node.id);
    const isRoot = !node.parentId;

    let bgColor = '';
    if (hl === 'new') bgColor = 'bg-green-100';
    else if (hl === 'modified') bgColor = 'bg-orange-100';
    else if (hl === 'deleted') bgColor = 'bg-red-100 line-through';

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-gray-100 border-b border-gray-50 text-sm transition-colors
            ${bgColor}
            ${activeChapterId === node.chapterId ? 'bg-blue-100 hover:bg-blue-150' : ''}
            ${dragOverId === node.id ? 'border-t-2 border-blue-400' : ''}
          `}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          draggable
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDrop={(e) => handleDrop(e, node.id)}
          onDragLeave={() => setDragOverId(null)}
          onClick={() => onSelectChapter(node.chapterId, node.title)}
        >
          {isRoot && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
              className="text-gray-400 hover:text-gray-600 w-4 shrink-0"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!isRoot && <span className="w-4 shrink-0" />}

          {editingId === node.id ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={() => commitEdit(node.id)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(node.id); }}
              autoFocus
              className="flex-1 border rounded px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-blue-300"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className={`flex-1 truncate ${isRoot ? 'font-medium' : 'text-gray-700'}`}>
              {node.title}
            </span>
          )}

          {/* Hover actions */}
          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0">
            {isRoot && (
              <button
                onClick={(e) => { e.stopPropagation(); addChild(node.id); }}
                className="text-gray-400 hover:text-blue-500 text-xs px-1"
                title="添加小节"
              >
                +
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); startEdit(node); }}
              className="text-gray-400 hover:text-blue-500 text-xs px-1"
              title="重命名"
            >
              ✎
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
              className="text-gray-400 hover:text-red-400 text-xs px-1"
              title="删除"
            >
              ✕
            </button>
          </div>

          {hl === 'deleted' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleUndoDelete(node.id); }}
              className="text-xs text-blue-500 hover:underline shrink-0 ml-1"
            >
              撤销
            </button>
          )}
        </div>

        {isExpanded && hasChildren && getChildren(node.id).map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b space-y-2">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="描述你想写的故事..."
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          onClick={handleGenerate}
          disabled={generating || !description.trim()}
          className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 text-sm font-medium"
        >
          {generating ? '生成中...' : '生成大纲'}
        </button>
        {genProgress && (
          <div className="text-xs text-gray-500 max-h-20 overflow-y-auto whitespace-pre-wrap">
            {genProgress}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {roots.sort((a, b) => a.order - b.order).map(node => renderNode(node, 0))}
        {roots.length === 0 && !generating && (
          <p className="text-center text-gray-400 text-sm mt-8">
            输入故事描述，点击"生成大纲"开始
          </p>
        )}
      </div>

      {roots.length > 0 && (
        <div className="p-2 border-t">
          <button
            onClick={addRoot}
            className="w-full text-gray-500 py-1.5 rounded-lg hover:bg-gray-100 text-sm"
          >
            + 新建章节
          </button>
        </div>
      )}
    </div>
  );
}
