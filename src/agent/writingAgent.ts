import OpenAI from 'openai';
import { db, type OutlineNode, type Character } from '../storage/database';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PolishContext {
  chapterContent: string;
  outlineTitle: string;
  siblingTitles: string[];
  characters: Character[];
  worldview: string;
  customInstruction: string;
}

async function buildSystemPrompt(): Promise<string> {
  const [characters, worldview, settings] = await Promise.all([
    db.characters.toArray(),
    db.getWorldview(),
    db.getSettings(),
  ]);

  let context = '';

  if (worldview.content) {
    context += `\n## 故事背景\n${worldview.content}\n`;
  }

  if (characters.length > 0) {
    context += '\n## 人物设定\n';
    characters.forEach(c => {
      context += `### ${c.name}（${c.role}）\n`;
      context += `- 外貌：${c.appearance}\n`;
      context += `- 性格：${c.personality}\n`;
      if (c.psychology) context += `- 心理状态：${c.psychology}\n`;
      if (c.motivation) context += `- 动机：${c.motivation}\n`;
      if (c.traits.length > 0) context += `- 标签：${c.traits.join('、')}\n`;
      if (c.relationships.length > 0) {
        context += '- 关系：\n';
        c.relationships.forEach(r => {
          context += `  - ${r.characterName}：${r.description}\n`;
        });
      }
      context += '\n';
    });
  }

  const styleMap: Record<string, string> = {
    formal: '正式、严谨',
    casual: '轻松、自然',
    literary: '文学性、富有意境',
    concise: '简洁、精炼',
  };

  return `你是一个专业的写作助手，帮助作者进行创作。
${context}
写作风格偏好：${styleMap[settings.style] ?? settings.style}

你的能力：
1. 协助构思故事大纲和章节结构
2. 润色、修改和扩写文本
3. 提供写作建议和反馈
4. 保持人物性格和世界观的一致性

请用友好、鼓励的语气与用户交流。用中文回复。`;
}

export async function streamChat(
  apiKey: string,
  model: string,
  history: ChatMessage[],
  onDelta: (delta: string) => void,
): Promise<string> {
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const systemPrompt = await buildSystemPrompt();

  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
    ],
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      fullText += delta;
      onDelta(delta);
    }
  }
  return fullText;
}

function buildPolishPrompt(ctx: PolishContext): string {
  let prompt = '请润色以下章节内容';

  if (ctx.customInstruction) {
    prompt += `，要求：${ctx.customInstruction}`;
  }

  prompt += `。\n\n## 当前章节位置\n章节：${ctx.outlineTitle}`;

  if (ctx.siblingTitles.length > 0) {
    prompt += `\n前后章节：${ctx.siblingTitles.join('、')}`;
  }

  if (ctx.characters.length > 0) {
    prompt += '\n\n## 关联人物\n';
    ctx.characters.forEach(c => {
      prompt += `- ${c.name}（${c.role}）：性格${c.personality}`;
      if (c.psychology) prompt += `，当前心理：${c.psychology}`;
      prompt += '\n';
    });
  }

  if (ctx.worldview) {
    prompt += `\n## 故事背景\n${ctx.worldview}\n`;
  }

  prompt += `\n## 待润色内容\n\n${ctx.chapterContent}\n\n请直接返回润色后的完整文本，不要加额外说明。`;

  return prompt;
}

/** 上下文感知的章节润色 */
export async function polishChapter(
  apiKey: string,
  model: string,
  ctx: PolishContext,
  onDelta: (delta: string) => void,
): Promise<string> {
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const systemPrompt = await buildSystemPrompt();
  const userPrompt = buildPolishPrompt(ctx);

  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      fullText += delta;
      onDelta(delta);
    }
  }
  return fullText;
}

interface OutlineItem {
  title: string;
  children: { title: string }[];
}

/** 根据描述生成大纲 */
export async function generateOutline(
  apiKey: string,
  model: string,
  description: string,
  existingOutline: OutlineNode[],
  onDelta: (delta: string) => void,
): Promise<OutlineItem[]> {
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  let existingHint = '';
  if (existingOutline.length > 0) {
    existingHint = '\n现有大纲如下，请在保留合理部分的基础上进行增量更新：\n';
    const roots = existingOutline.filter(n => !n.parentId);
    for (const r of roots) {
      existingHint += `- ${r.title}\n`;
      const children = existingOutline.filter(n => n.parentId === r.id);
      for (const c of children) {
        existingHint += `  - ${c.title}\n`;
      }
    }
    existingHint += '\n请返回完整大纲，新增的章节用 [新增] 标记，修改的用 [修改] 标记。';
  }

  const stream = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你是一个专业的故事大纲规划师。根据用户描述生成二级目录的故事大纲。请严格按以下JSON格式返回，不要加其他内容：
{
  "outline": [
    {
      "title": "第一章标题",
      "children": [
        {"title": "1.1 小节标题"},
        {"title": "1.2 小节标题"}
      ]
    }
  ]
}`,
      },
      {
        role: 'user',
        content: `故事描述：${description}${existingHint}`,
      },
    ],
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      fullText += delta;
      onDelta(delta);
    }
  }

  try {
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.outline || [];
    }
  } catch {
    // Fallback: parse markdown list
  }
  return [];
}

/** AI 生成人物设定 */
export async function generateCharacter(
  apiKey: string,
  model: string,
  brief: string,
  onDelta: (delta: string) => void,
): Promise<Partial<Character> | null> {
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const stream = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你是一个专业的角色设定师。根据简短描述生成完整的人物设定。严格按JSON格式返回：
{
  "name": "角色名",
  "role": "身份/职业",
  "appearance": "外貌描写",
  "personality": "详细性格描述",
  "traits": ["标签1", "标签2"],
  "psychology": "初始心理状态",
  "motivation": "核心动机/目标"
}`,
      },
      { role: 'user', content: brief },
    ],
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      fullText += delta;
      onDelta(delta);
    }
  }

  try {
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* fallthrough */ }
  return null;
}

/** AI 生成世界观 */
export async function generateWorldview(
  apiKey: string,
  model: string,
  keywords: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const stream = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: '你是一个世界观架构师。根据关键词生成结构化的故事世界观设定，包括时代背景、地理环境、社会制度、科技/魔法体系等。用中文，分段清晰。',
      },
      { role: 'user', content: keywords },
    ],
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      fullText += delta;
      onDelta(delta);
    }
  }
  return fullText;
}

/** 更新人物心理状态（基于故事上下文） */
export async function updateCharacterPsychology(
  apiKey: string,
  model: string,
  character: Character,
  relatedPassages: string[],
  onDelta: (delta: string) => void,
): Promise<{ personality: string; psychology: string; traits: string[] } | null> {
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const passages = relatedPassages.join('\n---\n');

  const stream = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你是一个角色发展分析师。根据故事段落，分析角色性格和心理状态的变化。返回JSON：
{
  "personality": "更新后的性格描述",
  "psychology": "当前心理状态",
  "traits": ["标签"],
  "changes": "简短说明变化原因（如：经历了XX事件后...）"
}`,
      },
      {
        role: 'user',
        content: `角色：${character.name}（${character.role}）
当前性格：${character.personality}
当前心理：${character.psychology}

相关段落：
${passages}`,
      },
    ],
    stream: true,
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      fullText += delta;
      onDelta(delta);
    }
  }

  try {
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* fallthrough */ }
  return null;
}
