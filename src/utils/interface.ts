import { z } from "zod";

// ModelInfo schema
export const ModelInfoSchema = z.object({
    id: z.string(),
    object: z.string(),
    created: z.number(),
    owned_by: z.string(),
    name: z.string(),
    description: z.string(),
    context_window: z.number(),
    max_tokens: z.number(),
    type: z.string(),
    tags: z.array(z.string()).optional(),
    pricing: z.object({
        input: z.string().optional(),
        output: z.string().optional(),
        input_cache_read: z.string().optional(),
        input_cache_write: z.string().optional(),
        web_search: z.string().optional(),
        image: z.string().optional(),
    }),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

// ModelsResponse schema
export const ModelsResponseSchema = z.object({
    object: z.string(),
    data: z.array(ModelInfoSchema),
});

export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;

// ============ 自定义模型（第三方 Key）===========
export const CustomModelProviderSchema = z.object({
    id: z.string(),
    /**
     * 用户自定义组名（用于模型列表分组展示）。
     */
    name: z.string(),
    enabled: z.boolean(),
    /**
     * 用户提供的第三方 Key。
     * 注意：该字段在本地持久化时必须加密存储（StoreUtils 默认 encrypt=true）。
     */
    apiKey: z.string(),
    /**
     * OpenAI 兼容接口 baseURL。
     * 例：https://api.openai.com/v1
     *     https://your-proxy.example.com/v1
     */
    baseUrl: z.string(),
    /**
     * 最近一次探测到的可用模型列表（缓存）。
     */
    models: z.array(ModelInfoSchema).optional(),
    lastValidatedAt: z.number().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
});

export type CustomModelProvider = z.infer<typeof CustomModelProviderSchema>;

// StoredChatMessage schema
export const StoredChatMessageSchema = z.object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system", "data"]),
    content: z.string(),
    timestamp: z.number(),
    reasoning: z.string().optional(),
    isThinking: z.boolean().optional(),
    parts: z.array(z.any()).optional(), // 保存多模态/思维链部分
});

export type StoredChatMessage = z.infer<typeof StoredChatMessageSchema>;

// Conversation schema
export const ConversationSchema = z.object({
    id: z.string(),
    title: z.string(),
    messages: z.array(StoredChatMessageSchema),
    createdAt: z.number(),
    updatedAt: z.number(),
    modelId: z.string().optional(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

// ConversationItem schema
export const ConversationItemSchema = z.object({
    key: z.string(),
    label: z.string(),
    timestamp: z.number().optional(),
    // 用于列表展示/优化：不必加载完整 messages 即可判断是否为空
    messageCount: z.number().optional(),
});

export type ConversationItem = z.infer<typeof ConversationItemSchema>;

// CheckpointType schema
export const CheckpointTypeSchema = z.object({
    id: z.string(),
    messageIndex: z.number(),
    timestamp: z.date(),
    messageCount: z.number(),
});

export type CheckpointType = z.infer<typeof CheckpointTypeSchema>;

// McpServer schema
export const McpServerSchema = z.discriminatedUnion("type", [
    z.object({
        id: z.string(),
        name: z.string(),
        enabled: z.boolean(),
        type: z.literal("stdio"),
        command: z.string(),
        args: z.array(z.string()),
        cwd: z.string().optional(),
        env: z.record(z.string(), z.string()).optional(),
        // Optional Glosc Store metadata (not sent to MCP server).
        store: z
            .object({
                slug: z.string(),
                kind: z.enum(["package", "file", "url"]),
                version: z.string().optional(),
                pricingType: z.string().optional(),
                description: z.string().optional(),
            })
            .optional(),
    }),
    z.object({
        id: z.string(),
        name: z.string(),
        enabled: z.boolean(),
        type: z.literal("http"),
        url: z.string(),
        headers: z.record(z.string(), z.string()).optional(),
        // Optional Glosc Store metadata (not sent to MCP server).
        store: z
            .object({
                slug: z.string(),
                kind: z.enum(["package", "file", "url"]),
                version: z.string().optional(),
                pricingType: z.string().optional(),
                description: z.string().optional(),
            })
            .optional(),
    }),
]);

export type McpServer = z.infer<typeof McpServerSchema>;

export type ClientToolRegistry = Record<string, any>;
export type CreateChatClientOptions = {
    /**
     * 后端 Chat/Agent 接口路径。
     * 默认 `/api/chat`；任务模式可传 `/api/agent`。
     */
    apiPath?: string;
    /**
     * 客户端可执行工具表（通常来自 MCP）。
     * onToolCall 会在这里查找 toolName 并执行其 execute。
     */
    toolsRef?: ShallowRef<ClientToolRegistry | null>;
    /**
     * 可选：把工具调用/执行过程打到控制台，便于排查为何停在 tool-calls。
     */
    debugTools?: boolean;
};
