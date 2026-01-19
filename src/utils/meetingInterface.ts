import { z } from "zod";

// 会议角色 Schema
export const MeetingRoleSchema = z.object({
    id: z.string(),
    name: z.string(),
    avatar: z.string().optional(), // 头像URL或emoji
    modelId: z.string(), // 使用的模型ID
    systemPrompt: z.string(), // 角色人设/提示词
    enabledMcpServerIds: z.array(z.string()).optional(), // 角色可用的MCP工具
    color: z.string().optional(), // 角色气泡颜色
});

export type MeetingRole = z.infer<typeof MeetingRoleSchema>;

// 会议状态
export type MeetingStatus = "idle" | "running" | "paused" | "stopped";

// 发言者类型
export type SpeakerType = "role" | "user" | "task";

// 队列节点 Schema
export const QueueNodeSchema = z.object({
    id: z.string(),
    type: z.enum(["role", "user", "task"]),
    roleId: z.string().optional(), // 如果是角色发言
    taskType: z.string().optional(), // 如果是任务节点（如"总结会议"）
});

export type QueueNode = z.infer<typeof QueueNodeSchema>;

// 会议消息 Schema（扩展自 StoredChatMessage）
export const MeetingMessageSchema = z.object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    timestamp: z.number(),
    speakerId: z.string(), // 发言者ID（角色ID或"user"）
    speakerName: z.string(), // 发言者名称
    speakerAvatar: z.string().optional(), // 发言者头像
    speakerColor: z.string().optional(), // 发言者颜色
    isGenerating: z.boolean().optional(), // 是否正在生成中
    reasoning: z.string().optional(),
    isThinking: z.boolean().optional(),
});

export type MeetingMessage = z.infer<typeof MeetingMessageSchema>;

// 会议 Schema
export const MeetingSchema = z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(), // 会议摘要/背景（全局系统提示词）
    createdAt: z.number(),
    updatedAt: z.number(),
    roles: z.array(MeetingRoleSchema), // 会议角色列表
    messages: z.array(MeetingMessageSchema), // 会议消息历史
    status: z.enum(["idle", "running", "paused", "stopped"]),
    currentSpeakerIndex: z.number().optional(), // 当前发言者在队列中的索引
    speakerQueue: z.array(QueueNodeSchema).optional(), // 发言队列
    autoAdvance: z.boolean().optional(), // 是否自动推进到下一个发言者
    autoCycle: z.boolean().optional(), // 是否自动循环（到队列末尾后回到开头继续）
});

export type Meeting = z.infer<typeof MeetingSchema>;

// 会议列表项 Schema（用于列表展示）
export const MeetingItemSchema = z.object({
    key: z.string(),
    label: z.string(),
    summary: z.string(),
    timestamp: z.number(),
    roleCount: z.number(),
    messageCount: z.number(),
});

export type MeetingItem = z.infer<typeof MeetingItemSchema>;

// 默认头像列表（emoji）
export const DEFAULT_AVATARS = [
    "👨‍💼",
    "👩‍💼",
    "👨‍💻",
    "👩‍💻",
    "👨‍🔬",
    "👩‍🔬",
    "👨‍🎨",
    "👩‍🎨",
    "👨‍🏫",
    "👩‍🏫",
    "👨‍⚖️",
    "👩‍⚖️",
    "🤖",
    "🦾",
    "🧠",
    "💡",
    "🎯",
    "🔥",
    "⚡",
    "🌟",
];

// 默认颜色列表
export const DEFAULT_COLORS = [
    "#3b82f6", // blue
    "#ef4444", // red
    "#10b981", // green
    "#f59e0b", // amber
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#84cc16", // lime
];
