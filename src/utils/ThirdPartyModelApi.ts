import type { ModelInfo } from "@/utils/interface";

function normalizeBaseUrl(url: string): string {
    const u = String(url || "").trim();
    return u.endsWith("/") ? u.slice(0, -1) : u;
}

function createPlaceholderModel(partial: {
    id: string;
    name?: string;
    owned_by?: string;
    description?: string;
    context_window?: number;
    max_tokens?: number;
    type?: string;
    tags?: string[];
}): ModelInfo {
    return {
        id: partial.id,
        object: "model",
        created: 0,
        owned_by: partial.owned_by || "OpenAI兼容",
        name: partial.name || partial.id,
        description: partial.description || "",
        context_window: partial.context_window || 0,
        max_tokens: partial.max_tokens || 0,
        type: partial.type || "chat",
        tags: partial.tags,
        pricing: {},
    };
}

async function fetchOpenAICompatibleModels(params: {
    baseUrl: string;
    apiKey: string;
}): Promise<ModelInfo[]> {
    const baseUrl = normalizeBaseUrl(params.baseUrl);
    const apiKey = String(params.apiKey || "").trim();
    if (!baseUrl) throw new Error("baseUrl 不能为空");
    if (!apiKey) throw new Error("API Key 不能为空");

    const res = await fetch(`${baseUrl}/models`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
            `获取模型失败(${res.status})：${text || res.statusText}`,
        );
    }

    const json: any = await res.json();
    const data: any[] = Array.isArray(json?.data) ? json.data : [];

    return data
        .map((m) => String(m?.id || "").trim())
        .filter(Boolean)
        .map((id) =>
            createPlaceholderModel({
                id,
                name: id,
                owned_by: "OpenAI兼容",
                tags: ["OpenAI兼容"],
            }),
        );
}

export async function probeThirdPartyModels(params: {
    apiKey: string;
    baseUrl: string;
}): Promise<ModelInfo[]> {
    return fetchOpenAICompatibleModels({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
    });
}
