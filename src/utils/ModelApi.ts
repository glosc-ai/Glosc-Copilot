/**
 * 模型 API 工具类
 */

/**
 * 从 Vercel AI Gateway 获取可用模型列表
 */
export async function fetchAvailableModels(): Promise<ModelInfo[]> {
    try {
        const host = import.meta.env.VITE_API_HOST || "http://localhost:3000";
        const response = await fetch(`${host}/api/models`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ModelsResponse = await response.json();
        return data.data || [];
    } catch (error) {
        console.error("Failed to fetch models:", error);
        throw error;
    }
}

/**
 * 格式化模型名称用于显示
 */
export function formatModelName(modelId: string): string {
    // 移除提供商前缀，使显示更简洁
    const parts = modelId.split("/");
    return parts.length > 1 ? parts[parts.length - 1] : modelId;
}

/**
 * 获取模型提供商
 */
export function getModelProvider(modelId: string): string {
    const parts = modelId.split("/");
    return parts.length > 1 ? parts[0] : "unknown";
}

/**
 * 按提供商分组模型（使用 owned_by 字段）
 */
export function groupModelsByProvider(
    models: ModelInfo[]
): Record<string, ModelInfo[]> {
    return models.reduce((acc, model) => {
        const provider = model.owned_by || "unknown";
        if (!acc[provider]) {
            acc[provider] = [];
        }
        acc[provider].push(model);
        return acc;
    }, {} as Record<string, ModelInfo[]>);
}
