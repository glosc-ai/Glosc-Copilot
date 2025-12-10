interface ModelInfo {
    id: string;
    object: string;
    created: number;
    owned_by: string;
    name: string;
    description: string;
    context_window: number;
    max_tokens: number;
    type: string;
    tags?: string[];
    pricing: {
        input?: string;
        output?: string;
        input_cache_read?: string;
        input_cache_write?: string;
        web_search?: string;
        image?: string;
    };
}

interface ModelsResponse {
    object: string;
    data: ModelInfo[];
}

// 会话消息接口
interface StoredChatMessage {
    id: string;
    role: "user" | "assistant" | "system" | "data";
    content: string;
    timestamp: number;
    // 思维链相关
    reasoning?: string;
    isThinking?: boolean;
    parts?: any[]; // 保存多模态/思维链部分
}

// 会话接口
interface Conversation {
    id: string;
    title: string;
    messages: StoredChatMessage[];
    createdAt: number;
    updatedAt: number;
    modelId?: string;
}

// 会话列表项
interface ConversationItem {
    key: string;
    label: string;
    timestamp?: number;
}

interface CheckpointType {
    id: string;
    messageIndex: number;
    timestamp: Date;
    messageCount: number;
}
