# 写作 Agent 设计文档

基于 pi-mono 的四个基础工具，设计一个写作 Agent。
前期后端API 采用design api。
不需要通过SDK调用，直接通过后端API调用。

```typescript
import { Agent, streamProxy } from "@mariozechner/pi-agent-core";

const agent = new Agent({
  streamFn: (model, context, options) =>
    streamProxy(model, context, {
      ...options,
      authToken: "...",
      proxyUrl: "https://your-server.com",
    }),
});

```

## 一、写作 Agent 的核心能力设计

写作 Agent 需要具备以下能力：

1. **结构化规划** — 生成大纲、章节划分
2. **内容生成** — 按章节逐步写作
3. **迭代修改** — 基于反馈调整内容
4. **外部知识获取** — 搜索参考资料、查证事实
5. **风格控制** — 适配不同文体（小说/论文/博客）
6. **版本管理** — 保存不同草稿版本

---

## 二、工具集设计（基于 pi-mono 的四个基础工具扩展）

### 2.1 写作专用工具定义

```typescript
import { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";

// 1. 大纲管理工具
const outlineTools: AgentTool[] = [
  {
    name: "generate_outline",
    label: "生成大纲",
    description: "根据主题生成文章/书籍的结构大纲",
    parameters: Type.Object({
      topic: Type.String({ description: "写作主题" }),
      type: Type.String({ 
        description: "文体类型", 
        enum: ["essay", "article", "novel", "report"] 
      }),
      length: Type.String({ description: "篇幅要求", enum: ["short", "medium", "long"] })
    }),
    async execute(_id, params) {
      const { topic, type, length } = params as any;
      // 调用 LLM 生成大纲
      const outline = await generateOutlineFromLLM(topic, type, length);
      return {
        content: [{ type: "text", text: JSON.stringify(outline, null, 2) }],
        details: { outline, topic }
      };
    }
  },
  
  // 2. 分章节写作工具
  {
    name: "write_chapter",
    label: "写作章节",
    description: "根据大纲和章节信息生成具体内容",
    parameters: Type.Object({
      outline: Type.String({ description: "完整大纲（JSON格式）" }),
      chapterIndex: Type.Number({ description: "章节索引（从0开始）" }),
      previousContext: Type.Optional(Type.String({ description: "前文摘要" }))
    }),
    async execute(_id, params) {
      const { outline, chapterIndex, previousContext } = params as any;
      const outlineObj = JSON.parse(outline);
      const chapter = outlineObj.chapters[chapterIndex];
      
      // 调用 LLM 生成章节内容
      const content = await generateChapterFromLLM(chapter, previousContext);
      
      // 保存到文件
      const filename = `chapter_${chapterIndex + 1}_${chapter.title}.md`;
      await fs.writeFile(filename, content, "utf-8");
      
      return {
        content: [{ type: "text", text: `已生成章节 ${chapter.title} 并保存至 ${filename}` }],
        details: { filename, wordCount: content.split(/\s+/).length }
      };
    }
  },
  
  // 3. 润色与改写工具
  {
    name: "polish_text",
    label: "润色文本",
    description: "改进文本的表达、语法、风格",
    parameters: Type.Object({
      text: Type.String({ description: "待润色的文本" }),
      style: Type.String({ 
        description: "目标风格",
        enum: ["formal", "casual", "literary", "concise", "detailed"]
      })
    }),
    async execute(_id, params) {
      const { text, style } = params as any;
      const polished = await polishTextFromLLM(text, style);
      return {
        content: [{ type: "text", text: polished }],
        details: { originalLength: text.length, polishedLength: polished.length }
      };
    }
  },
  
  // 4. 搜索参考资料（集成外部API）
  {
    name: "search_reference",
    label: "搜索资料",
    description: "搜索特定主题的参考资料",
    parameters: Type.Object({
      query: Type.String({ description: "搜索关键词" }),
      maxResults: Type.Optional(Type.Number({ description: "最多返回结果数", default: 3 }))
    }),
    async execute(_id, params) {
      const { query, maxResults = 3 } = params as any;
      // 调用搜索API（如 Serper、Brave Search）
      const results = await searchWeb(query, maxResults);
      return {
        content: [{ 
          type: "text", 
          text: results.map(r => `- [${r.title}](${r.url}): ${r.snippet}`).join("\n\n")
        }],
        details: { query, resultCount: results.length }
      };
    }
  },
  
  // 5. 版本保存工具
  {
    name: "save_version",
    label: "保存版本",
    description: "保存当前草稿的快照",
    parameters: Type.Object({
      content: Type.String({ description: "要保存的内容" }),
      version: Type.Optional(Type.String({ description: "版本描述" })),
      filename: Type.String({ description: "文件名" })
    }),
    async execute(_id, params) {
      const { content, version, filename } = params as any;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const versionFile = filename.replace(/\.md$/, `_v${version || timestamp}.md`);
      await fs.writeFile(versionFile, content, "utf-8");
      return {
        content: [{ type: "text", text: `版本已保存至 ${versionFile}` }],
        details: { versionFile }
      };
    }
  }
];
```

---

## 三、完整的写作 Agent 实现

### 3.1 核心 Agent 类

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { createInterface } from "readline";

interface WritingAgentConfig {
  apiKey: string;
  model?: string;
  workDir?: string;
}

export class WritingAgent {
  private agent: Agent;
  private currentOutline: any = null;
  private workDir: string;
  
  constructor(config: WritingAgentConfig) {
    this.workDir = config.workDir || "./writing_workspace";
    
    // 确保工作目录存在
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }
    
    // 初始化 pi-mono Agent
    this.agent = new Agent({
      getApiKey: () => config.apiKey,
      initialState: {
        systemPrompt: this.getSystemPrompt(),
        model: config.model || "claude-sonnet-4",
        thinkingLevel: "medium",  // 写作任务需要适度的推理
        tools: outlineTools,
        messages: [],
        isStreaming: true,
        streamMessage: null,
        pendingToolCalls: new Set(),
      },
    });
    
    // 订阅事件，实时显示写作进度
    this.agent.subscribe((event) => {
      this.handleAgentEvent(event);
    });
  }
  
  private getSystemPrompt(): string {
    return `你是一位专业的写作助手，擅长各类文体创作。

**你的核心能力**：
1. 结构规划：帮助用户梳理思路，生成清晰的大纲
2. 内容创作：按章节生成高质量内容，保持风格一致
3. 迭代优化：基于用户反馈修改完善
4. 参考资料整合：搜索并整合外部信息

**写作流程**：
- 先与用户确认主题、目标受众、风格偏好
- 生成大纲，获得用户确认
- 分章节写作，每章完成后请用户审阅
- 根据反馈修改，直至满意
- 提供润色建议

**注意事项**：
- 保持对话式交互，主动询问用户意见
- 记录用户偏好（如避免某些词汇、偏好简洁风格）
- 重要决策（如改变大纲）前先征得用户同意

当前工作目录：${this.workDir}`;
  }
  
  private handleAgentEvent(event: any) {
    if (event.type === "message_update") {
      const ae = event.assistantMessageEvent;
      if (ae.type === "text_delta") {
        process.stdout.write(ae.delta);
      }
    } else if (event.type === "tool_execution_start") {
      console.log(`\n📚 [工具调用: ${event.toolName}]`);
    } else if (event.type === "tool_execution_end") {
      console.log(`✅ [工具完成: ${event.toolName}]\n`);
    }
  }
  
  // 启动交互式写作会话
  async start() {
    console.log("✍️  写作 Agent 已启动\n");
    console.log("命令说明：");
    console.log("  - 直接输入写作需求");
    console.log("  - /save - 保存当前进度");
    console.log("  - /outline - 查看当前大纲");
    console.log("  - /version - 保存版本");
    console.log("  - /quit - 退出\n");
    
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const promptUser = async () => {
      rl.question("\n> ", async (input) => {
        if (input === "/quit") {
          console.log("再见！");
          rl.close();
          return;
        }
        
        if (input === "/save") {
          await this.saveProgress();
          promptUser();
          return;
        }
        
        if (input === "/outline") {
          console.log("\n当前大纲：");
          console.log(JSON.stringify(this.currentOutline, null, 2));
          promptUser();
          return;
        }
        
        if (input === "/version") {
          await this.saveVersion();
          promptUser();
          return;
        }
        
        // 正常对话
        console.log("\n🤖 Agent 思考中...\n");
        await this.agent.prompt(input);
        promptUser();
      });
    };
    
    await promptUser();
  }
  
  private async saveProgress() {
    const messages = this.agent.getState().messages;
    const progressFile = `${this.workDir}/progress_${Date.now()}.json`;
    await fs.writeFile(progressFile, JSON.stringify(messages, null, 2), "utf-8");
    console.log(`💾 进度已保存至 ${progressFile}`);
  }
  
  private async saveVersion() {
    // 获取最近生成的内容（从消息中提取）
    const messages = this.agent.getState().messages;
    const lastAssistantMsg = messages.filter(m => m.role === "assistant").pop();
    if (lastAssistantMsg && typeof lastAssistantMsg.content === "string") {
      const versionFile = `${this.workDir}/version_${Date.now()}.md`;
      await fs.writeFile(versionFile, lastAssistantMsg.content, "utf-8");
      console.log(`📝 版本已保存至 ${versionFile}`);
    }
  }
}
```

---

## 四、高级功能扩展

### 4.1 风格学习工具

让 Agent 学习用户的写作风格：

```typescript
const styleTools: AgentTool[] = [
  {
    name: "learn_style",
    label: "学习风格",
    description: "分析用户提供的样本，提取写作风格特征",
    parameters: Type.Object({
      sampleText: Type.String({ description: "用户写作样本" })
    }),
    async execute(_id, params) {
      const { sampleText } = params as any;
      const analysis = await analyzeStyle(sampleText);
      
      // 将风格特征存入状态
      const styleProfile = {
        avgSentenceLength: analysis.avgSentenceLength,
        vocabularyLevel: analysis.vocabularyLevel,
        frequentPhrases: analysis.frequentPhrases,
        tone: analysis.tone
      };
      
      return {
        content: [{ type: "text", text: `已分析并记录您的写作风格：\n- 平均句长：${analysis.avgSentenceLength} 词\n- 词汇水平：${analysis.vocabularyLevel}\n- 语气：${analysis.tone}` }],
        details: styleProfile
      };
    }
  }
];
```

### 4.2 角色扮演模式

支持模拟不同作家的风格：

```typescript
const writerStyles = {
  鲁迅: "文笔犀利，善用讽刺，句子简洁有力",
  村上春树: "细腻感性，充满隐喻，节奏舒缓",
  学术论文: "客观严谨，逻辑清晰，术语准确"
};

// 在对话开始时设置
await agent.prompt("请以鲁迅的风格，帮我写一篇关于现代社会的杂文");
```

### 4.3 多模态支持（如果使用支持视觉的模型）

```typescript
// 从图片生成描述
const imageTools: AgentTool[] = [
  {
    name: "describe_image",
    label: "描述图片",
    description: "分析图片内容，生成文字描述",
    parameters: Type.Object({
      imageUrl: Type.String({ description: "图片URL或本地路径" })
    }),
    async execute(_id, params) {
      const { imageUrl } = params as any;
      const description = await analyzeImage(imageUrl);
      return {
        content: [{ type: "text", text: description }],
        details: { imageUrl }
      };
    }
  }
];
```

---

## 五、使用示例

### 5.1 基本使用

```typescript
// 初始化
const writer = new WritingAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4",
  workDir: "./my_novel"
});

// 启动交互式会话
await writer.start();

// 或直接通过代码驱动
await writer.agent.prompt("帮我写一篇关于 AI 对写作影响的文章大纲");
```

### 5.2 典型交互流程

```
用户: 我想写一篇关于 AI 对写作影响的文章，目标读者是作家群体，风格偏学术但可读性强

Agent: 好的，我为您准备了以下大纲：
1. 引言：AI 写作工具的兴起
2. AI 作为辅助工具的优势
3. 对传统写作流程的挑战
4. 作家群体的适应策略
5. 未来展望：人机协作的新范式
6. 结语

请确认这个结构是否合适？

用户: 很好，请开始写第一章

Agent: [调用 write_chapter 工具，生成第一章内容]
```

---

## 六、优化建议

### 6.1 上下文管理
写作任务容易超出上下文窗口，建议：
- 定期总结已写内容，作为摘要注入
- 使用 `thinkingLevel: "minimal"` 减少系统开销
- 利用工具保存中间状态

### 6.2 质量保证
```typescript
// 添加自动质量检查工具
{
  name: "quality_check",
  description: "检查文本的可读性、重复率、逻辑连贯性",
  // ...实现逻辑
}
```

### 6.3 成本控制
```typescript
// 监控 token 使用
this.agent.subscribe((event) => {
  if (event.type === "turn_end") {
    const tokens = event.tokenUsage;
    console.log(`📊 Token 使用: ${tokens.input}/${tokens.output}`);
  }
});
```

---

## 七、部署与集成

### 作为 CLI 工具
```bash
#!/usr/bin/env node
const writer = new WritingAgent({ apiKey: process.env.ANTHROPIC_API_KEY });
writer.start();
```

### 作为 API 服务
```typescript
app.post("/api/write", async (req, res) => {
  const { prompt, style } = req.body;
  const agent = new WritingAgent({ apiKey: config.apiKey });
  
  let fullResponse = "";
  agent.subscribe((event) => {
    if (event.type === "message_update") {
      fullResponse += event.assistantMessageEvent.delta || "";
      res.write(fullResponse);
    }
  });
  
  await agent.prompt(prompt);
  res.end();
});
```

---
