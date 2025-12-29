export type GeneratedImageResult = {
    url: string;
    mimeType?: string;
    revoke?: () => void;
};

export type GenerateImageRequest = {
    model: string;
    prompt: string;
    aspectRatio?: `${number}:${number}`;
    n?: number;
    size?: `${number}x${number}`;
    seed?: number;
    providerOptions?: Record<string, any>;
};

function getApiHost() {
    return import.meta.env.VITE_API_HOST || "http://localhost:3000";
}

function isHttpUrl(value: string) {
    return /^https?:\/\//i.test(value);
}

function normalizeBase64(base64: string) {
    return base64.replace(/^data:.*;base64,/, "").trim();
}

function isUint8ArrayLike(value: any): value is number[] {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => typeof v === "number" && v >= 0 && v <= 255)
    );
}

function getFirstImageCandidate(data: any): any {
    if (!data) return undefined;

    // From docs: { image }
    if (data.image != null) return data.image;

    // Some providers may return { images: [...] }
    if (Array.isArray(data.images) && data.images.length > 0) {
        return data.images[0];
    }

    // Other common wrappers
    if (data.data?.image != null) return data.data.image;
    if (Array.isArray(data.data?.images) && data.data.images.length > 0) {
        return data.data.images[0];
    }
    if (data.result?.image != null) return data.result.image;
    if (Array.isArray(data.result?.images) && data.result.images.length > 0) {
        return data.result.images[0];
    }

    // Legacy / fallback
    return data.imageUrl ?? data.url ?? data.output?.image;
}

function getJsonImageCandidate(data: any): any {
    return getFirstImageCandidate(data);
}

export async function requestGeneratedImage(
    input: GenerateImageRequest
): Promise<GeneratedImageResult> {
    const model = input.model?.trim();
    const trimmedPrompt = input.prompt?.trim();
    if (!model || !trimmedPrompt) {
        throw new Error("model 和 prompt 不能为空");
    }

    const host = getApiHost();
    const response = await fetch(`${host}/api/image`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            prompt: trimmedPrompt,
            aspectRatio: input.aspectRatio,
            n: input.n,
            seed: input.seed,
            size: input.size,
            providerOptions: input.providerOptions ?? {},
        }),
    });

    if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const errorBody = contentType.includes("application/json")
            ? await response.json().catch(() => null)
            : await response.text().catch(() => "");

        const message =
            (typeof errorBody === "string" && errorBody) ||
            errorBody?.message ||
            errorBody?.error ||
            `HTTP ${response.status}`;

        throw new Error(message);
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.startsWith("image/")) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        return {
            url,
            mimeType: blob.type || contentType,
            revoke: () => URL.revokeObjectURL(url),
        };
    }

    const data = await response.json().catch(() => null);
    const candidate = getJsonImageCandidate(data);

    // Some runtimes serialize Uint8Array as number[]
    if (isUint8ArrayLike(candidate)) {
        const bytes = new Uint8Array(candidate);
        const blob = new Blob([bytes], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        return {
            url,
            mimeType: "image/png",
            revoke: () => URL.revokeObjectURL(url),
        };
    }

    if (typeof candidate === "string") {
        if (candidate.startsWith("data:")) {
            return { url: candidate };
        }
        if (candidate.startsWith("blob:") || isHttpUrl(candidate)) {
            return { url: candidate };
        }

        // Assume it's base64
        const base64 = normalizeBase64(candidate);
        return {
            url: `data:image/png;base64,${base64}`,
            mimeType: "image/png",
        };
    }

    if (candidate && typeof candidate === "object") {
        // { url }
        if (typeof candidate.url === "string") {
            return { url: candidate.url };
        }

        // { base64, mimeType } | { data, mimeType }
        // AI SDK docs commonly expose: { image: { base64, mimeType } }
        if (candidate.image != null) {
            const nested = candidate.image;
            if (typeof nested === "string") {
                const base64 = normalizeBase64(nested);
                return {
                    url: `data:image/png;base64,${base64}`,
                    mimeType: "image/png",
                };
            }
            if (nested && typeof nested === "object") {
                const nestedBase64 =
                    typeof nested.base64 === "string"
                        ? nested.base64
                        : typeof nested.data === "string"
                          ? nested.data
                          : undefined;
                if (nestedBase64) {
                    const nestedMimeType =
                        nested.mimeType || nested.mime_type || "image/png";
                    return {
                        url: `data:${nestedMimeType};base64,${normalizeBase64(nestedBase64)}`,
                        mimeType: nestedMimeType,
                    };
                }
            }
        }

        const base64 =
            typeof candidate.base64 === "string"
                ? candidate.base64
                : typeof candidate.data === "string"
                  ? candidate.data
                  : undefined;

        if (base64) {
            const mimeType =
                candidate.mimeType || candidate.mime_type || "image/png";
            return {
                url: `data:${mimeType};base64,${normalizeBase64(base64)}`,
                mimeType,
            };
        }
    }

    throw new Error("后端响应格式无法识别（未找到图片数据）");
}
