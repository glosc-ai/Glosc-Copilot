import type { McpServer } from "@/utils/interface";
import { GloscStoreApi } from "@/utils/GloscStoreApi";

export type StoreToolAccessStatus = "ok" | "expired" | "invalid" | "unknown";

export type StoreToolAccessInfo = {
    status: StoreToolAccessStatus;
    label: string;
    reason?: string;
};

export function isStoreInstalledServer(
    server: McpServer,
): server is Extract<McpServer, { type: "stdio" }> {
    return server.type === "stdio" && Boolean(server.env?.GLOSC_STORE_SLUG);
}

export function getStoreSlug(server: McpServer): string | null {
    if (server.type !== "stdio") return null;
    const slug = String(server.env?.GLOSC_STORE_SLUG || "").trim();
    return slug || null;
}

export function getStorePricingTypeFromEnv(server: McpServer): string | null {
    if (server.type !== "stdio") return null;
    const raw = String(server.env?.GLOSC_STORE_PRICING_TYPE || "").trim();
    return raw || null;
}

export function getStoreToolAccessInfoFromEnv(
    server: McpServer,
): StoreToolAccessInfo | null {
    if (server.type !== "stdio") return null;
    const raw = String(server.env?.GLOSC_STORE_ACCESS_STATUS || "").trim();
    if (!raw) return null;

    const status = raw as StoreToolAccessStatus;
    if (status === "expired") return { status, label: "已过期" };
    if (status === "invalid") return { status, label: "已失效" };
    if (status === "unknown") return { status, label: "未验证" };
    return { status: "unknown", label: "未验证" };
}

export function isStoreToolBlocked(server: McpServer) {
    const info = getStoreToolAccessInfoFromEnv(server);
    return info?.status === "expired" || info?.status === "invalid";
}

async function runPool<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const runners = new Array(Math.max(1, concurrency))
        .fill(null)
        .map(async () => {
            for (;;) {
                const idx = nextIndex++;
                if (idx >= items.length) return;
                results[idx] = await worker(items[idx]);
            }
        });

    await Promise.all(runners);
    return results;
}

function isLikely404(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return /\b404\b/.test(msg) || /not found/i.test(msg);
}

function nextEnvWithAccess(
    server: Extract<McpServer, { type: "stdio" }>,
    patch: Record<string, string | null | undefined>,
) {
    const env: Record<string, string> = { ...(server.env || {}) };
    for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || String(v).trim() === "") {
            delete env[k];
        } else {
            env[k] = String(v);
        }
    }
    return env;
}

export async function syncInstalledStoreToolsAccess(params: {
    mcpStore: ReturnType<typeof useMcpStore>;
    authToken: string | null;
    notify?: boolean;
    concurrency?: number;
}) {
    const { mcpStore } = params;
    const notify = params.notify ?? false;
    const concurrency = params.concurrency ?? 6;

    const installed = mcpStore.servers.filter(isStoreInstalledServer);
    if (!installed.length) {
        return { disabled: 0, marked: 0, checked: 0 };
    }

    let librarySlugs = new Set<string>();
    if (params.authToken) {
        try {
            const res = await GloscStoreApi.listLibrary(params.authToken);
            const slugs = (res.items || [])
                .map((p) => String(p.slug || "").trim())
                .filter(Boolean);
            librarySlugs = new Set(slugs);
        } catch {
            // If library fetch fails, fall back to conservative behavior below.
            librarySlugs = new Set();
        }
    }

    const uniqueSlugs = Array.from(
        new Set(
            installed
                .map((s) => String(s.env?.GLOSC_STORE_SLUG || "").trim())
                .filter(Boolean),
        ),
    );

    // Fetch plugin meta (existence + pricing type) without auth.
    const pluginMeta = new Map<
        string,
        | { ok: true; pricingType: string }
        | { ok: false; status: "invalid" | "unknown"; reason?: string }
    >();

    await runPool(uniqueSlugs, concurrency, async (slug) => {
        try {
            const plugin = await GloscStoreApi.getPlugin(slug);
            pluginMeta.set(slug, {
                ok: true,
                pricingType: String(plugin.pricing?.type || "") || "unknown",
            });
        } catch (e) {
            if (isLikely404(e)) {
                pluginMeta.set(slug, {
                    ok: false,
                    status: "invalid",
                    reason: "插件已从商店下架或不存在",
                });
            } else {
                pluginMeta.set(slug, {
                    ok: false,
                    status: "unknown",
                    reason:
                        (e instanceof Error ? e.message : String(e)) ||
                        "无法验证插件信息",
                });
            }
        }
    });

    let disabled = 0;
    let marked = 0;

    for (const server of installed) {
        const slug = String(server.env?.GLOSC_STORE_SLUG || "").trim();
        if (!slug) continue;

        const meta = pluginMeta.get(slug);
        const pricingType =
            meta && meta.ok
                ? meta.pricingType
                : getStorePricingTypeFromEnv(server) || "unknown";

        let nextStatus: StoreToolAccessStatus = "ok";
        let nextLabel: string | null = null;
        let nextReason: string | null = null;

        if (!meta) {
            nextStatus = "unknown";
            nextLabel = "未验证";
        } else if (!meta.ok) {
            nextStatus = meta.status;
            nextLabel = meta.status === "invalid" ? "已失效" : "未验证";
            nextReason = meta.reason || null;
        } else {
            // meta.ok
            if (pricingType !== "free") {
                if (!params.authToken) {
                    // No token: cannot validate entitlement. Be conservative to prevent unpaid usage.
                    nextStatus = "expired";
                    nextLabel = "已过期";
                    nextReason = "未登录，无法校验订阅/购买状态";
                } else if (!librarySlugs.has(slug)) {
                    nextStatus = "expired";
                    nextLabel = "已过期";
                    nextReason = "该工具不在你的库中（可能未续费或已移除）";
                }
            }
        }

        const currently = getStoreToolAccessInfoFromEnv(server)?.status || "ok";
        const shouldDisable =
            (nextStatus === "expired" || nextStatus === "invalid") &&
            server.enabled;
        const shouldMark =
            nextStatus !== currently ||
            (pricingType &&
                pricingType !== (server.env?.GLOSC_STORE_PRICING_TYPE || ""));

        if (!shouldDisable && !shouldMark) continue;

        const env = nextEnvWithAccess(server, {
            GLOSC_STORE_PRICING_TYPE: pricingType,
            GLOSC_STORE_ACCESS_STATUS: nextStatus === "ok" ? null : nextStatus,
            GLOSC_STORE_ACCESS_LABEL:
                nextStatus === "ok" ? null : nextLabel || null,
            GLOSC_STORE_ACCESS_REASON:
                nextStatus === "ok" ? null : nextReason || null,
            GLOSC_STORE_ACCESS_UPDATED_AT:
                nextStatus === "ok" ? null : new Date().toISOString(),
        });

        await mcpStore.updateServer(server.id, {
            enabled: shouldDisable ? false : server.enabled,
            env,
        });

        if (shouldDisable) disabled += 1;
        if (nextStatus !== "ok") marked += 1;
    }

    if (notify && disabled > 0) {
        try {
            ElMessage.warning(
                `已自动禁用 ${disabled} 个已过期/失效的 Store 工具`,
            );
        } catch {
            // ignore (ElMessage might not be available in some contexts)
        }
    }

    return { disabled, marked, checked: installed.length };
}
