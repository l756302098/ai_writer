import OpenAI from 'openai';
import { db } from '../storage/database';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 构建注入世界观和风格的系统提示词 */
async function buildSystemPrompt(): Promise<string> {
  const [characters, locations, settings] = await Promise.all([
    db.characters.toArray(),
    db.locations.toArray(),
    db.getSettings(),
  ]);

  let worldview = '';
  if (characters.length > 0 || locations.length > 0) {
    worldview = '\n## 故事设定\n\n';
    if (characters.length > 0) {
      worldview += '### 人物\n';
      characters.forEach(c => { worldview += `- **${c.name}**：${c.description}\n`; });
      worldview += '\n';
    }
    if (locations.length > 0) {
      worldview += '### 地点\n';
      locations.forEach(l => { worldview += `- **${l.name}**：${l.description}\n`; });
    }
  }

  const styleMap: Record<string, string> = {
    formal: '正式、严谨',
    casual: '轻松、自然',
    literary: '文学性、富有意境',
    concise: '简洁、精炼',
  };

  return `你是一个专业的写作助手，帮助作者进行创作。
${worldview}
写作风格偏好：${styleMap[settings.style] ?? settings.style}

你的能力：
1. 协助构思故事大纲和章节结构
2. 润色、修改和扩写文本
3. 提供写作建议和反馈
4. 保持人物性格和世界观的一致性

请用友好、鼓励的语气与用户交流。若用户提供了选中的文本，请针对该文本给出具体建议。`;
}

/**
 * 以流式方式调用 DeepSeek API。
 *
 * @param apiKey    DeepSeek API Key
 * @param model     模型名称，如 "deepseek-chat" / "deepseek-reasoner"
 * @param history   本轮对话前的历史消息
 * @param onDelta   每收到一个文本片段时的回调
 * @returns         完整回复文本
 */
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
