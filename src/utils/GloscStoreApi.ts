type StorePricing =
    | { type: "free" }
    | { type: "paid"; priceCents: number; currency: "USD" }
    | { type: "subscription"; priceCents: number; currency: "USD" };

export type StorePluginSource =
    | { type: "package"; manager: "npx" | "uvx"; name: string }
    | { type: "file"; language: "ts" | "js" | "py" }
    | { type: "url"; url: string };

export type StorePlugin = {
    id: string;
    slug: string;
    name: string;
    summary: string;
    description: string;
    iconUrl: string;
    screenshots: string[];
    category: string;
    tags: string[];
    source?: StorePluginSource;
    author: { id: string; name: string; avatarUrl?: string };
    ratingAvg: number;
    ratingCount: number;
    installCount: number;
    pricing: StorePricing;
    status: string;
    createdAt: string;
    updatedAt: string;
};

export type StorePluginVersion = {
    id: string;
    pluginId: string;
    version: string;
    changelog: string;
    artifact: {
        downloadUrl: string;
        sha256?: string;
        sizeBytes?: number;
        filename?: string;
        contentType?: string;
        gridfsId?: string;
    };
    releasedAt: string;
    createdAt?: string;
};

function getStoreHost() {
    return (
        import.meta.env.VITE_STORE_HOST ||
        import.meta.env.VITE_SITE_HOST ||
        import.meta.env.VITE_API_HOST ||
        "http://localhost:3000"
    );
}

async function storeFetch<T>(
    path: string,
    init?: RequestInit & { token?: string | null },
): Promise<T> {
    const host = getStoreHost();
    const url = `${host}${path.startsWith("/") ? path : `/${path}`}`;

    const headers = new Headers(init?.headers || undefined);
    headers.set(
        "Content-Type",
        headers.get("Content-Type") || "application/json",
    );

    if (init?.token) {
        headers.set("Authorization", `Bearer ${init.token}`);
    }

    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
    }

    return (await res.json().catch(() => null)) as T;
}

export const GloscStoreApi = {
    host: getStoreHost,

    async listPlugins(params: {
        q?: string;
        category?: string;
        sort?: "popular" | "newest" | "rating";
        pricing?: "free" | "paid" | "subscription";
        sourceType?: "package" | "file" | "url";
        limit?: number;
        offset?: number;
    }) {
        const qs = new URLSearchParams();
        if (params.q) qs.set("q", params.q);
        if (params.category) qs.set("category", params.category);
        if (params.sort) qs.set("sort", params.sort);
        if (params.pricing) qs.set("pricing", params.pricing);
        if (params.sourceType) qs.set("sourceType", params.sourceType);
        if (params.limit != null) qs.set("limit", String(params.limit));
        if (params.offset != null) qs.set("offset", String(params.offset));

        return await storeFetch<{ items: StorePlugin[]; total: number }>(
            `/api/store/plugins?${qs.toString()}`,
        );
    },

    async getPlugin(slug: string) {
        return await storeFetch<StorePlugin>(
            `/api/store/plugins/${encodeURIComponent(slug)}`,
        );
    },

    async getVersions(slug: string) {
        return await storeFetch<{ items: StorePluginVersion[] }>(
            `/api/store/plugins/${encodeURIComponent(slug)}/versions`,
        );
    },

    async getLibraryStatus(slug: string, token: string) {
        return await storeFetch<{
            inLibrary: boolean;
            pricingType?: string;
            autoRenew?: boolean;
            acquiredAt?: string;
        }>(`/api/store/plugins/${encodeURIComponent(slug)}/library`, {
            method: "GET",
            token,
        });
    },

    async acquireToLibrary(slug: string, token: string) {
        return await storeFetch<{ ok: boolean }>(
            `/api/store/plugins/${encodeURIComponent(slug)}/library`,
            {
                method: "POST",
                token,
                body: JSON.stringify({}),
            },
        );
    },

    async listLibrary(token: string) {
        return await storeFetch<{ items: StorePlugin[] }>(
            `/api/store/me/library`,
            {
                method: "GET",
                token,
            },
        );
    },

    async downloadVersion(params: {
        slug: string;
        version: string;
        token?: string | null;
    }) {
        const host = getStoreHost();
        const url = `${host}/api/store/plugins/${encodeURIComponent(
            params.slug,
        )}/versions/${encodeURIComponent(params.version)}/download`;

        const headers: Record<string, string> = {};
        if (params.token) headers.Authorization = `Bearer ${params.token}`;

        const res = await fetch(url, { method: "GET", headers });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(text || `HTTP ${res.status}`);
        }

        const buf = await res.arrayBuffer();
        return new Uint8Array(buf);
    },
};
