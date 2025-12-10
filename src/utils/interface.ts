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
    tags: string[];
    pricing: {
        input: string;
        output: string;
    };
}

interface ModelsResponse {
    object: string;
    data: ModelInfo[];
}

// 会话消息接口
interface StoredChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    // 思维链相关
    reasoning?: string;
    isThinking?: boolean;
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
