# AI 聊天工具使用指南

## 功能特性

✨ 基于 Ant Design X Vue 的现代化聊天界面
🤖 集成 DeepSeek AI 模型，支持智能对话
💬 流式响应，实时显示 AI 回复
🎨 精美的气泡式消息设计
⌨️ 支持快捷键操作（Enter 发送，Shift+Enter 换行）
🧹 一键清空对话历史

## 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全
- **Ant Design X Vue** - 企业级 UI 组件库（AI 增强版）
- **Vercel AI SDK** - AI 集成工具
- **DeepSeek API** - AI 模型服务
- **Tauri** - 跨平台桌面应用框架

## 项目结构

```
src/pages/index.vue    # AI 聊天主界面
src/main.ts            # 应用入口
src/App.vue            # 根组件
```

## 快速开始

### 1. 启动开发服务器

```bash
# 使用 Tauri 开发模式
yarn tauri:dev

# 或使用 Vite 开发模式
yarn dev
```

### 2. 配置 API Key

在 `src/pages/index.vue` 中配置您的 DeepSeek API Key：

```typescript
const deepseek = createDeepSeek({
    apiKey: "your-api-key-here",  // 替换为您的 API Key
    baseURL: "https://api.deepseek.com",
});
```

### 3. 使用聊天工具

1. 在输入框中输入您的问题
2. 按 `Enter` 键或点击"发送"按钮
3. AI 将实时流式回复您的消息
4. 支持多轮对话，AI 会记住上下文

## 功能说明

### 消息显示

- **用户消息**：显示在右侧，蓝色头像
- **AI 消息**：显示在左侧，绿色头像
- **加载状态**：AI 思考时显示加载动画

### 快捷键

- `Enter`：发送消息
- `Shift + Enter`：换行

### 清空对话

点击右上角的"清空对话"按钮，重置聊天历史。

## 自定义配置

### 更改 AI 模型

在 `sendMessage` 函数中修改模型：

```typescript
const { textStream } = streamText({
    model: deepseek("deepseek-chat"),  // 可选: deepseek-reasoner
    messages: chatHistory as any,
});
```

### 自定义样式

在 `<style scoped>` 部分修改样式，例如：

```css
.chat-wrapper {
    max-width: 900px;  /* 调整聊天窗口宽度 */
}

.chat-header {
    background: #fff;  /* 修改头部背景色 */
}
```

### 修改头像颜色

```typescript
const userAvatar: CSSProperties = {
    color: "#fff",
    backgroundColor: "#1890ff",  // 用户头像背景色
};

const assistantAvatar: CSSProperties = {
    color: "#fff",
    backgroundColor: "#52c41a",  // AI 头像背景色
};
```

## 常见问题

### 1. API 调用失败

- 检查网络连接
- 确认 API Key 是否正确
- 查看控制台错误信息

### 2. 消息不显示

- 确保已正确配置 Ant Design Vue
- 检查浏览器控制台是否有错误

### 3. 流式响应不工作

- 确认使用的是支持流式响应的模型
- 检查 Vercel AI SDK 配置

## 进阶功能

### 添加消息历史持久化

```typescript
import { watch } from "vue";

// 保存到 localStorage
watch(messages, (newMessages) => {
    localStorage.setItem("chat-history", JSON.stringify(newMessages));
}, { deep: true });

// 从 localStorage 恢复
const savedMessages = localStorage.getItem("chat-history");
if (savedMessages) {
    messages.value = JSON.parse(savedMessages);
}
```

### 添加打字音效

```typescript
const playTypingSound = () => {
    const audio = new Audio("/typing-sound.mp3");
    audio.play();
};
```

### 支持 Markdown 渲染

安装 `markdown-it`：

```bash
yarn add markdown-it @types/markdown-it
```

然后在 Bubble 组件中使用：

```vue
<Bubble
    :content="renderMarkdown(msg.content)"
/>
```

## 相关资源

- [Ant Design X Vue 文档](https://antd-design-x-vue.netlify.app/)
- [DeepSeek API 文档](https://platform.deepseek.com/docs)
- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [Vue 3 文档](https://vuejs.org/)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
