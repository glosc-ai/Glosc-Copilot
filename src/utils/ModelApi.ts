/**
 * 模型 API 工具类
 */

/**
 * 旧版在线模型列表入口已移除。
 * 当前应用只展示用户本地配置并验证过的服务商模型。
 */
export async function fetchAvailableModels(): Promise<ModelInfo[]> {
    return [];
}

/**
 * 格式化模型名称用于显示
 */
export function formatModelName(modelId: string): string {
    // 移除提供商前缀，使显示更简洁
    const parts = modelId.split("/");
    const lastPart = parts.length > 1 ? parts[parts.length - 1] : modelId;
    // 解码 URI 编码的字符（如 %2F → /），解决自定义模型名中 / 被转译的问题
    try {
        return decodeURIComponent(lastPart);
    } catch {
        return lastPart;
    }
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
    models: ModelInfo[],
): Record<string, ModelInfo[]> {
    return models.reduce(
        (acc, model) => {
            const provider = model.owned_by || "unknown";
            if (!acc[provider]) {
                acc[provider] = [];
            }
            acc[provider].push(model);
            return acc;
        },
        {} as Record<string, ModelInfo[]>,
    );
}
