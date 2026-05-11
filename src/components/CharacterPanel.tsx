import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db, type Character, type CharacterEvolution } from '../storage/database';
import { generateCharacter, updateCharacterPsychology } from '../agent/writingAgent';

interface CharacterPanelProps {
  chapterContent: string;
}

export function CharacterPanel({ chapterContent }: CharacterPanelProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [genAI, setGenAI] = useState<Record<string, string>>({});
  const [evolutions, setEvolutions] = useState<Record<string, CharacterEvolution[]>>({});
  const [updatingPsy, setUpdatingPsy] = useState<string | null>(null);

  // New character form
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newAppearance, setNewAppearance] = useState('');
  const [newPersonality, setNewPersonality] = useState('');
  const [newTraits, setNewTraits] = useState('');
  const [newPsychology, setNewPsychology] = useState('');
  const [newMotivation, setNewMotivation] = useState('');

  useEffect(() => { loadCharacters(); }, []);

  const loadCharacters = async () => {
    const list = await db.characters.toArray();
    setCharacters(list);
    for (const c of list) {
      const evos = await db.getCharacterEvolutions(c.id);
      if (evos.length > 0) {
        setEvolutions(prev => ({ ...prev, [c.id]: evos }));
      }
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const char: Character = {
      id: uuidv4(),
      name: newName.trim(),
      role: newRole.trim(),
      appearance: newAppearance.trim(),
      personality: newPersonality.trim(),
      traits: newTraits.split(/[,，]/).map(t => t.trim()).filter(Boolean),
      psychology: newPsychology.trim(),
      motivation: newMotivation.trim(),
      relationships: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.characters.add(char);
    resetForm();
    await loadCharacters();
  };

  const resetForm = () => {
    setNewName(''); setNewRole(''); setNewAppearance('');
    setNewPersonality(''); setNewTraits(''); setNewPsychology('');
    setNewMotivation(''); setShowAdd(false);
  };

  const handleAIGenerate = async () => {
    if (!aiBrief.trim()) return;
    const { apiKey, model } = await db.getSettings();
    if (!apiKey) { alert('请先配置 API Key'); return; }

    const charId = uuidv4();
    setGenAI(prev => ({ ...prev, [charId]: '生成中...' }));
    try {
      const result = await generateCharacter(apiKey, model, aiBrief.trim(), (d) => {
        setGenAI(prev => ({ ...prev, [charId]: (prev[charId] || '') + d }));
      });
      if (result && result.name) {
        const char: Character = {
          id: charId,
          name: result.name || '',
          role: result.role || '',
          appearance: result.appearance || '',
          personality: result.personality || '',
          traits: result.traits || [],
          psychology: result.psychology || '',
          motivation: result.motivation || '',
          relationships: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.characters.add(char);
        await loadCharacters();
      }
    } catch (e) {
      setGenAI(prev => ({ ...prev, [charId]: `错误：${e instanceof Error ? e.message : '未知'}` }));
    }
    setAiBrief('');
    setShowAI(false);
  };

  const handleUpdatePsychology = async (character: Character) => {
    if (!chapterContent.trim()) {
      alert('请在编辑区先写入一些内容');
      return;
    }

    const { apiKey, model } = await db.getSettings();
    if (!apiKey) { alert('请先配置 API Key'); return; }

    setUpdatingPsy(character.id);
    try {
      const result = await updateCharacterPsychology(
        apiKey, model, character, [chapterContent], () => {}
      );
      if (result) {
        const evolution: CharacterEvolution = {
          id: uuidv4(),
          characterId: character.id,
          chapterContext: '基于当前章节内容的分析',
          previousState: `${character.personality} / ${character.psychology}`,
          newState: `${result.personality} / ${result.psychology}`,
          timestamp: Date.now(),
          accepted: false,
        };
        await db.characterEvolutions.add(evolution);

        setEvolutions(prev => ({
          ...prev,
          [character.id]: [evolution, ...(prev[character.id] || [])],
        }));
      }
    } catch (e) {
      alert(`更新失败：${e instanceof Error ? e.message : '未知'}`);
    } finally {
      setUpdatingPsy(null);
    }
  };

  const acceptEvolution = async (characterId: string, evoId: string) => {
    const evo = (evolutions[characterId] || []).find(e => e.id === evoId);
    if (!evo) return;

    const [personality, psychology] = evo.newState.split(' / ');
    await db.characters.update(characterId, { personality, psychology, updatedAt: Date.now() });
    await db.characterEvolutions.update(evoId, { accepted: true });
    await loadCharacters();
  };

  const rejectEvolution = async (evoId: string) => {
    await db.characterEvolutions.delete(evoId);
    setEvolutions(prev => {
      const next = { ...prev };
      for (const cid of Object.keys(next)) {
        next[cid] = next[cid].filter(e => e.id !== evoId);
      }
      return next;
    });
  };

  const deleteCharacter = async (id: string) => {
    if (!confirm('确认删除此人物？')) return;
    await db.characters.delete(id);
    await db.characterEvolutions.where({ characterId: id }).delete();
    await loadCharacters();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b space-y-2">
        <button
          onClick={() => { setShowAdd(true); setShowAI(false); }}
          className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 text-sm font-medium"
        >
          + 新增人物
        </button>
        <button
          onClick={() => { setShowAI(true); setShowAdd(false); }}
          className="w-full border border-blue-300 text-blue-600 py-2 rounded-lg hover:bg-blue-50 text-sm"
        >
          AI 生成人物
        </button>
        {chapterContent.trim() && (
          <p className="text-xs text-gray-400 text-center">
            编辑区有内容时可更新人物心理状态
          </p>
        )}
      </div>

      {/* AI generate form */}
      {showAI && (
        <div className="p-3 border-b bg-gray-50">
          <textarea
            value={aiBrief}
            onChange={e => setAiBrief(e.target.value)}
            placeholder="简短描述人物，如：一个被派往异星的人类大使，表面冷静内心挣扎..."
            rows={2}
            className="w-full border rounded px-2 py-1 text-sm mb-2 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAIGenerate}
              disabled={!aiBrief.trim()}
              className="flex-1 bg-blue-500 text-white py-1 rounded text-sm hover:bg-blue-600 disabled:bg-gray-300"
            >
              生成
            </button>
            <button onClick={() => setShowAI(false)} className="px-3 py-1 border rounded text-sm text-gray-500">
              取消
            </button>
          </div>
          {Object.values(genAI).map((v, i) => (
            <div key={i} className="text-xs text-gray-500 mt-2 max-h-16 overflow-y-auto whitespace-pre-wrap">{v}</div>
          ))}
        </div>
      )}

      {/* Add character form */}
      {showAdd && (
        <div className="p-3 border-b bg-gray-50 max-h-80 overflow-y-auto space-y-2">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="姓名 *" className="w-full border rounded px-2 py-1 text-sm"
          />
          <input
            value={newRole} onChange={e => setNewRole(e.target.value)}
            placeholder="身份/职业" className="w-full border rounded px-2 py-1 text-sm"
          />
          <textarea
            value={newAppearance} onChange={e => setNewAppearance(e.target.value)}
            placeholder="外貌描写" rows={2} className="w-full border rounded px-2 py-1 text-sm resize-none"
          />
          <textarea
            value={newPersonality} onChange={e => setNewPersonality(e.target.value)}
            placeholder="性格描述" rows={2} className="w-full border rounded px-2 py-1 text-sm resize-none"
          />
          <input
            value={newTraits} onChange={e => setNewTraits(e.target.value)}
            placeholder="性格标签（逗号分隔，如：冷静,多疑）" className="w-full border rounded px-2 py-1 text-sm"
          />
          <textarea
            value={newPsychology} onChange={e => setNewPsychology(e.target.value)}
            placeholder="心理状态" rows={2} className="w-full border rounded px-2 py-1 text-sm resize-none"
          />
          <textarea
            value={newMotivation} onChange={e => setNewMotivation(e.target.value)}
            placeholder="动机/目标" rows={2} className="w-full border rounded px-2 py-1 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!newName.trim()} className="flex-1 bg-blue-500 text-white py-1 rounded text-sm hover:bg-blue-600 disabled:bg-gray-300">
              添加
            </button>
            <button onClick={resetForm} className="px-3 py-1 border rounded text-sm text-gray-500">取消</button>
          </div>
        </div>
      )}

      {/* Character list */}
      <div className="flex-1 overflow-y-auto">
        {characters.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-8">暂无人物，点击上方按钮添加</p>
        )}
        {characters.map(c => {
          const isOpen = expanded.has(c.id);
          const charEvolutions = evolutions[c.id] || [];
          const isUpdating = updatingPsy === c.id;

          return (
            <div key={c.id} className="border-b">
              <div
                className="flex items-center px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(c.id)}
              >
                <span className="text-gray-400 text-xs mr-2">{isOpen ? '▼' : '▶'}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm truncate">{c.name}</span>
                  {c.role && <span className="text-gray-400 text-xs ml-2">{c.role}</span>}
                </div>
                {c.traits.length > 0 && (
                  <span className="text-xs text-gray-500 mr-2 truncate hidden sm:inline">
                    {c.traits.slice(0, 3).join(' · ')}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); deleteCharacter(c.id); }}
                  className="text-gray-300 hover:text-red-400 text-xs shrink-0"
                >
                  ✕
                </button>
              </div>

              {isOpen && (
                <div className="px-4 pb-3 bg-gray-50 text-sm space-y-1.5">
                  {c.role && <div><span className="text-gray-500">身份：</span>{c.role}</div>}
                  {c.appearance && <div><span className="text-gray-500">外貌：</span>{c.appearance}</div>}
                  {c.personality && <div><span className="text-gray-500">性格：</span>{c.personality}</div>}
                  {c.traits.length > 0 && (
                    <div>
                      <span className="text-gray-500">标签：</span>
                      {c.traits.map(t => (
                        <span key={t} className="inline-block bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs mr-1 mb-1">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {c.psychology && <div><span className="text-gray-500">心理：</span>{c.psychology}</div>}
                  {c.motivation && <div><span className="text-gray-500">动机：</span>{c.motivation}</div>}

                  <div className="pt-2">
                    <button
                      onClick={() => handleUpdatePsychology(c)}
                      disabled={isUpdating || !chapterContent.trim()}
                      className="text-xs text-blue-500 hover:underline disabled:text-gray-300"
                    >
                      {isUpdating ? '分析中...' : '根据当前内容更新心理'}
                    </button>
                  </div>

                  {/* Evolution timeline */}
                  {charEvolutions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-400 mb-1">演变时间线：</p>
                      {charEvolutions.map(e => (
                        <div key={e.id} className={`text-xs mb-1.5 p-1.5 rounded ${e.accepted ? 'bg-gray-100' : 'bg-blue-50'}`}>
                          <p className="text-gray-600">{e.chapterContext}</p>
                          <p className="text-gray-400 line-through text-[11px]">{e.previousState}</p>
                          <p className="text-gray-700">→ {e.newState}</p>
                          {!e.accepted && (
                            <div className="flex gap-2 mt-1">
                              <button onClick={() => acceptEvolution(c.id, e.id)} className="text-green-600 hover:underline">采纳</button>
                              <button onClick={() => rejectEvolution(e.id)} className="text-gray-400 hover:underline">放弃</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
