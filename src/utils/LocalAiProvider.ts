import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { parseCustomModelId } from "@/utils/CustomModelId";
import type { CustomModelProvider } from "@/utils/interface";

export type LocalAiRequestBody = {
    model?: string;
    useUserKey?: boolean;
    userModelProvider?: string;
    userModelProviderId?: string;
    userModelGroupName?: string;
    userModelApiKey?: string;
    userModelBaseUrl?: string;
    webSearch?: boolean;
};

type MinimalProviderConfig = Pick<
    CustomModelProvider,
    "id" | "name" | "apiKey" | "baseUrl"
>;

export type ResolvedCustomProviderSelection = {
    provider: CustomModelProvider;
    rawModelId: string;
};

export type ResolvedCustomProviderRequest = ResolvedCustomProviderSelection & {
    requestBody: LocalAiRequestBody;
};

export type ResolvedLocalAiRequest = {
    modelId: string;
    providerId: string;
    providerName: string;
    baseUrl: string;
    apiKey: string;
};

type FetchLike = typeof fetch;

function toProviderName(name: string, fallbackId: string) {
    const input = String(name || fallbackId || "custom-provider").trim();
    const normalized = input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return normalized || "custom-provider";
}

export function normalizeAiBaseUrl(baseUrl: string) {
    const trimmed = String(baseUrl || "").trim();
    if (!trimmed) return "";
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function isLocalAiBaseUrl(baseUrl: string) {
    const normalized = normalizeAiBaseUrl(baseUrl);
    if (!normalized) return false;

    try {
        const url = new URL(normalized);
        return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(
            url.hostname,
        );
    } catch {
        return false;
    }
}

function getNativeFetch(): FetchLike | null {
    if (typeof window === "undefined") return null;

    const candidate = (window as any).fetchNative;
    if (typeof candidate !== "function") return null;

    return candidate.bind(window) as FetchLike;
}

function getCorsFetch(): FetchLike | null {
    if (typeof window === "undefined") return null;

    const candidate = (window as any).fetchCORS;
    if (typeof candidate !== "function") return null;

    return candidate.bind(window) as FetchLike;
}

/**
 * AI 请求优先使用原生 fetch，以保留流式响应。
 * 只有当原生请求在桌面 WebView 中因 CORS/网络失败时，才回退到 tauri-plugin-cors-fetch。
 */
export function resolveAiFetch(baseUrl: string): FetchLike {
    const nativeFetch = getNativeFetch();
    const corsFetch = getCorsFetch();

    if (!nativeFetch) {
        return (corsFetch || fetch).bind(globalThis) as FetchLike;
    }

    const normalizedBaseUrl = normalizeAiBaseUrl(baseUrl);
    if (!/^https?:\/\//i.test(normalizedBaseUrl)) {
        return nativeFetch;
    }

    return async (input, init) => {
        try {
            return await nativeFetch(input, init);
        } catch (error) {
            if (!corsFetch) throw error;
            return await corsFetch(input, init);
        }
    };
}

export function isApiKeyOptionalForBaseUrl(baseUrl: string) {
    return isLocalAiBaseUrl(baseUrl);
}

export function buildCustomProviderRequestBody(
    provider: MinimalProviderConfig,
    rawModelId: string,
): LocalAiRequestBody {
    return {
        model: String(rawModelId || "").trim(),
        useUserKey: true,
        userModelProviderId: String(provider.id || "").trim(),
        userModelProvider: "openai-compatible",
        userModelGroupName:
            String(provider.name || "").trim() || "自定义服务商",
        userModelApiKey: String(provider.apiKey || "").trim(),
        userModelBaseUrl: normalizeAiBaseUrl(provider.baseUrl),
    };
}

export function resolveCustomProviderSelection(
    modelId: string | null | undefined,
    getProviderById: (providerId: string) => CustomModelProvider | null,
): ResolvedCustomProviderSelection | null {
    const parsed = parseCustomModelId(modelId);
    if (!parsed) return null;

    const provider = getProviderById(parsed.providerId);
    if (!provider) return null;

    return {
        provider,
        rawModelId: parsed.rawModelId,
    };
}

export function resolveCustomProviderRequest(
    modelId: string | null | undefined,
    getProviderById: (providerId: string) => CustomModelProvider | null,
): ResolvedCustomProviderRequest | null {
    const resolved = resolveCustomProviderSelection(modelId, getProviderById);
    if (!resolved) return null;

    return {
        ...resolved,
        requestBody: buildCustomProviderRequestBody(
            resolved.provider,
            resolved.rawModelId,
        ),
    };
}

export function resolveLocalAiRequest(
    body: Record<string, any> | undefined,
): ResolvedLocalAiRequest {
    const modelId = String(body?.model || "").trim();
    if (!modelId) {
        throw new Error("请先选择一个可用模型。");
    }

    const providerType = String(body?.userModelProvider || "").trim();
    if (providerType && providerType !== "openai-compatible") {
        throw new Error(`暂不支持的模型服务商类型：${providerType}`);
    }

    const baseUrl = normalizeAiBaseUrl(String(body?.userModelBaseUrl || ""));
    if (!baseUrl) {
        throw new Error(
            "当前模型没有关联可用的 AI 服务商，请在设置中重新选择本地或自定义服务商。",
        );
    }

    return {
        modelId,
        providerId: String(body?.userModelProviderId || "").trim(),
        providerName:
            String(body?.userModelGroupName || "").trim() || "自定义服务商",
        baseUrl,
        apiKey: String(body?.userModelApiKey || "").trim(),
    };
}

function createProvider(config: MinimalProviderConfig) {
    const baseURL = normalizeAiBaseUrl(config.baseUrl);
    if (!baseURL) {
        throw new Error("Base URL 不能为空。");
    }

    return createOpenAICompatible({
        name: toProviderName(config.name, config.id),
        baseURL,
        apiKey: String(config.apiKey || "").trim() || undefined,
        fetch: resolveAiFetch(baseURL),
    });
}

export function createLanguageModelFromProvider(
    provider: MinimalProviderConfig,
    rawModelId: string,
) {
    const cleanModelId = String(rawModelId || "").trim();
    if (!cleanModelId) {
        throw new Error("模型 ID 不能为空。");
    }

    return createProvider(provider).chatModel(cleanModelId);
}

export function createImageModelFromProvider(
    provider: MinimalProviderConfig,
    rawModelId: string,
) {
    const cleanModelId = String(rawModelId || "").trim();
    if (!cleanModelId) {
        throw new Error("模型 ID 不能为空。");
    }

    return createProvider(provider).imageModel(cleanModelId);
}

export function createLanguageModelFromRequestBody(
    body: Record<string, any> | undefined,
) {
    const request = resolveLocalAiRequest(body);
    return createLanguageModelFromProvider(
        {
            id: request.providerId || request.providerName,
            name: request.providerName,
            apiKey: request.apiKey,
            baseUrl: request.baseUrl,
        },
        request.modelId,
    );
}
