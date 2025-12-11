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
    }),
    z.object({
        id: z.string(),
        name: z.string(),
        enabled: z.boolean(),
        type: z.literal("http"),
        url: z.string(),
        headers: z.record(z.string(), z.string()).optional(),
    }),
]);

export type McpServer = z.infer<typeof McpServerSchema>;
