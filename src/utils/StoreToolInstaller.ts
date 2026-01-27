import { unzipSync } from "fflate";
import YAML from "yaml";

import { appDataDir, join } from "@tauri-apps/api/path";
import { mkdir, writeFile, readFile, exists } from "@tauri-apps/plugin-fs";

import type { StorePlugin } from "@/utils/GloscStoreApi";
import { GloscStoreApi } from "@/utils/GloscStoreApi";
import type { McpServer } from "@/utils/interface";

type ToolConfig = {
    name?: string;
    description?: string;
    icon?: string;
    language?: string;
    author?: string;
    mcp?: {
        runtime?: "python" | "node";
        entry?: string;
        cwd?: string;
        env?: Record<string, string>;
        args?: string[];
    };
};

function validateToolConfig(toolConfig: ToolConfig) {
    if (!toolConfig || typeof toolConfig !== "object") return;

    const mcp = toolConfig.mcp;
    if (mcp === undefined) return;
    if (!mcp || typeof mcp !== "object") {
        throw new Error("config.yml 字段类型错误：mcp 期望对象");
    }

    if (mcp.runtime && mcp.runtime !== "python" && mcp.runtime !== "node") {
        throw new Error(
            "config.yml 字段无效：mcp.runtime 必须为 python 或 node",
        );
    }
    if (mcp.entry !== undefined && typeof mcp.entry !== "string") {
        throw new Error("config.yml 字段类型错误：mcp.entry 期望字符串");
    }
    if (mcp.cwd !== undefined && typeof mcp.cwd !== "string") {
        throw new Error("config.yml 字段类型错误：mcp.cwd 期望字符串");
    }
    if (mcp.args !== undefined) {
        if (
            !Array.isArray(mcp.args) ||
            mcp.args.some((x) => typeof x !== "string")
        ) {
            throw new Error("config.yml 字段类型错误：mcp.args 期望 string[]");
        }
    }
    if (mcp.env !== undefined) {
        if (!mcp.env || typeof mcp.env !== "object" || Array.isArray(mcp.env)) {
            throw new Error(
                "config.yml 字段类型错误：mcp.env 期望 Record<string, string>",
            );
        }
        for (const [k, v] of Object.entries(mcp.env)) {
            if (typeof v !== "string") {
                throw new Error(
                    `config.yml 字段类型错误：mcp.env.${k} 期望 string`,
                );
            }
        }
    }
}

async function ensureDir(path: string) {
    const ok = await exists(path);
    if (ok) return;
    await mkdir(path, { recursive: true });
}

function normalizeRelPath(p: string) {
    return String(p || "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\.\.(\/|$)/g, "")
        .trim();
}

function pickToolName(toolConfig: ToolConfig | null, plugin: StorePlugin) {
    const raw =
        String(toolConfig?.name || "").trim() ||
        String(plugin.name || "").trim() ||
        plugin.slug;
    return raw;
}

function pickToolDescription(
    toolConfig: ToolConfig | null,
    plugin: StorePlugin,
) {
    const raw =
        String(toolConfig?.description || "").trim() ||
        String(plugin.summary || "").trim() ||
        String(plugin.description || "").trim();
    return raw;
}

async function guessEntryFromFilesystem(params: {
    installDir: string;
    plugin: StorePlugin;
}): Promise<{ runtime: "python" | "node"; entry: string }> {
    // Prefer concrete files if present.
    const py = "src/python/main.py";
    const js = "src/TypeScript/main.js";

    if (await exists(await join(params.installDir, py))) {
        return { runtime: "python", entry: py };
    }
    if (await exists(await join(params.installDir, js))) {
        return { runtime: "node", entry: js };
    }

    // Fallback to convention by plugin.source.language.
    return guessEntryFromConvention(params.plugin);
}

async function validateToolLayout(params: {
    installDir: string;
    runtime: "python" | "node";
    entryRel: string;
    cwdRel: string;
}): Promise<string> {
    const entryAbsPrimary = await join(params.installDir, params.entryRel);
    let entryAbs = entryAbsPrimary;

    if (!(await exists(entryAbsPrimary))) {
        if (params.cwdRel) {
            const entryAbsAlt = await join(
                params.installDir,
                params.cwdRel,
                params.entryRel,
            );
            if (await exists(entryAbsAlt)) {
                entryAbs = entryAbsAlt;
            } else {
                throw new Error(
                    `工具入口不存在：${params.entryRel}（已尝试：${params.entryRel} 和 ${normalizeRelPath(`${params.cwdRel}/${params.entryRel}`)}；请检查包内文件或 config.yml 的 mcp.entry/mcp.cwd）`,
                );
            }
        } else {
            throw new Error(
                `工具入口不存在：${params.entryRel}（请检查包内文件或 config.yml 的 mcp.entry）`,
            );
        }
    }

    if (params.runtime === "python") {
        // Soft validations: if present, it helps confirm layout.
        const pyproject =
            (await exists(
                await join(params.installDir, "src/python/pyproject.toml"),
            )) ||
            (await exists(await join(params.installDir, "pyproject.toml")));
        const requirements =
            (await exists(
                await join(params.installDir, "src/python/requirements.txt"),
            )) ||
            (await exists(await join(params.installDir, "requirements.txt")));
        if (!pyproject && !requirements) {
            // Not fatal: allow pure-script tools.
        }
        return entryAbs;
    }

    // node
    const pkgJson =
        (await exists(
            await join(params.installDir, "src/TypeScript/package.json"),
        )) || (await exists(await join(params.installDir, "package.json")));
    if (!pkgJson) {
        // Not fatal: allow single-file JS tools.
    }
    if (entryAbs.toLowerCase().endsWith(".ts")) {
        throw new Error(
            "当前仅支持运行 JavaScript 入口（.js）。TypeScript 入口（.ts）请先构建为 .js，或在 config.yml 指向 main.js。",
        );
    }

    return entryAbs;
}

function guessEntryFromConvention(plugin: StorePlugin): {
    runtime: "python" | "node";
    entry: string;
} {
    const lang =
        plugin.source && plugin.source.type === "file"
            ? plugin.source.language
            : "";

    if (lang === "py") {
        return { runtime: "python", entry: "src/python/main.py" };
    }

    // Prefer runnable JS for Node.
    return { runtime: "node", entry: "src/TypeScript/main.js" };
}

async function ensureStoreEntitlement(params: {
    plugin: StorePlugin;
    token: string | null;
}) {
    const pricingType = params.plugin.pricing?.type || "unknown";

    // paid/subscription always require login + entitlement check
    if (pricingType !== "free") {
        if (!params.token) {
            throw new Error("该工具为付费/订阅项，请先登录再安装");
        }

        try {
            const status = await GloscStoreApi.getLibraryStatus(
                params.plugin.slug,
                params.token,
            );
            if (!status?.inLibrary) {
                throw new Error(
                    "该工具不在你的库中（可能未购买/未续费或已移除）",
                );
            }
            return;
        } catch (e: any) {
            const msg = e?.message || String(e);
            if (
                String(msg).includes("Billing not implemented") ||
                /\b501\b/.test(String(msg))
            ) {
                throw new Error(
                    "该插件为付费/订阅项，但当前 Store 计费/授权校验尚未接入（501 Billing not implemented），暂无法安装",
                );
            }
            throw e;
        }
    }

    // free: best-effort ensure in library (required by some download flows)
    if (!params.token) return;
    try {
        const status = await GloscStoreApi.getLibraryStatus(
            params.plugin.slug,
            params.token,
        );
        if (!status?.inLibrary) {
            await GloscStoreApi.acquireToLibrary(
                params.plugin.slug,
                params.token,
            );
        }
    } catch {
        // ignore: free tools can still be installed if store doesn't enforce library
    }
}

export async function installStoreTool(params: {
    plugin: StorePlugin;
    authToken: string | null;
    mcpStore: ReturnType<typeof useMcpStore>;
    autoEnable?: boolean;
    envOverrides?: Record<string, string> | null;
}) {
    const { plugin, authToken, mcpStore } = params;

    const envOverrides: Record<string, string> = {};
    if (params.envOverrides && typeof params.envOverrides === "object") {
        for (const [k, v] of Object.entries(params.envOverrides)) {
            const key = String(k || "").trim();
            if (!key) continue;
            if (/^GLOSC_/i.test(key)) continue;
            envOverrides[key] = String(v ?? "");
        }
    }

    if (!plugin.source) {
        throw new Error("该工具缺少 source 配置，无法安装");
    }

    if (plugin.source.type === "package") {
        await ensureStoreEntitlement({ plugin, token: authToken });

        const command = plugin.source.manager === "npx" ? "npx" : "uvx";
        const args =
            plugin.source.manager === "npx"
                ? ["-y", plugin.source.name]
                : [plugin.source.name];

        await mcpStore.addServer({
            type: "stdio",
            name: plugin.name,
            command,
            args,
            env: {
                ...envOverrides,
                GLOSC_STORE_SLUG: plugin.slug,
                GLOSC_STORE_KIND: "package",
                GLOSC_STORE_MANAGER: plugin.source.manager,
                GLOSC_STORE_PACKAGE: plugin.source.name,
                GLOSC_STORE_PRICING_TYPE: plugin.pricing?.type || "unknown",
                GLOSC_STORE_DESCRIPTION: pickToolDescription(null, plugin),
            },
            enabled: !!params.autoEnable,
        });

        return { kind: "package" as const };
    }

    if (plugin.source.type === "file") {
        if (!authToken) {
            throw new Error("请先登录，再安装需要下载的工具");
        }

        // 付费/订阅：只做授权校验；免费：必要时入库（避免 POST 触发 501）。
        await ensureStoreEntitlement({ plugin, token: authToken });

        const versions = await GloscStoreApi.getVersions(plugin.slug);
        const latest = versions.items?.[0];
        if (!latest?.version) {
            throw new Error("该工具暂无可用版本");
        }

        const zipBytes = await GloscStoreApi.downloadVersion({
            slug: plugin.slug,
            version: latest.version,
            token: authToken,
        });

        const root = await appDataDir();
        const toolsDir = await join(root, "glosc-tools");
        const installDir = await join(toolsDir, plugin.slug, latest.version);

        await ensureDir(await join(toolsDir, plugin.slug));
        await ensureDir(installDir);

        const files = unzipSync(zipBytes);
        const entries = Object.entries(files);

        for (const [rawPath, data] of entries) {
            const rel = normalizeRelPath(rawPath);
            if (!rel) continue;
            if (rel.endsWith("/")) {
                await ensureDir(await join(installDir, rel));
                continue;
            }

            const target = await join(installDir, rel);
            // ensure parent exists
            const parent = target.replace(/[\\/][^\\/]+$/, "");
            if (parent && parent !== target) {
                await ensureDir(parent);
            }

            await writeFile(target, data);
        }

        // config.yml (optional)
        let toolConfig: ToolConfig | null = null;
        const configPath = await join(installDir, "config.yml");
        if (await exists(configPath)) {
            const raw = await readFile(configPath);
            const text = new TextDecoder("utf-8").decode(raw);
            toolConfig = (YAML.parse(text) || null) as ToolConfig | null;
            if (toolConfig) validateToolConfig(toolConfig);
        }

        console.log(toolConfig);

        const guessed = await guessEntryFromFilesystem({ installDir, plugin });
        const runtime = toolConfig?.mcp?.runtime || guessed.runtime;
        const entryRel = normalizeRelPath(
            toolConfig?.mcp?.entry || guessed.entry,
        );
        const cwdRel = normalizeRelPath(toolConfig?.mcp?.cwd || "");

        const entryAbs = await validateToolLayout({
            installDir,
            runtime,
            entryRel,
            cwdRel,
        });
        const cwd = cwdRel ? await join(installDir, cwdRel) : installDir;
        const env = toolConfig?.mcp?.env || {};
        const extraArgs = toolConfig?.mcp?.args || [];

        const serverName = pickToolName(toolConfig, plugin);
        const serverDescription = pickToolDescription(toolConfig, plugin);

        if (runtime === "python") {
            await mcpStore.addServer({
                type: "stdio",
                name: serverName,
                command: "python",
                args: [entryAbs, ...extraArgs],
                cwd,
                env: {
                    ...env,
                    ...envOverrides,
                    GLOSC_STORE_SLUG: plugin.slug,
                    GLOSC_STORE_KIND: "file",
                    GLOSC_STORE_VERSION: latest.version,
                    GLOSC_STORE_PRICING_TYPE: plugin.pricing?.type || "unknown",
                    GLOSC_TOOL_DIR: installDir,
                    GLOSC_STORE_DESCRIPTION: serverDescription,
                },
                enabled: !!params.autoEnable,
            });
        } else {
            // node
            await mcpStore.addServer({
                type: "stdio",
                name: serverName,
                command: "node",
                args: [entryAbs, ...extraArgs],
                cwd,
                env: {
                    ...env,
                    ...envOverrides,
                    GLOSC_STORE_SLUG: plugin.slug,
                    GLOSC_STORE_KIND: "file",
                    GLOSC_STORE_VERSION: latest.version,
                    GLOSC_STORE_PRICING_TYPE: plugin.pricing?.type || "unknown",
                    GLOSC_TOOL_DIR: installDir,
                    GLOSC_STORE_DESCRIPTION: serverDescription,
                },
                enabled: !!params.autoEnable,
            });
        }

        return { kind: "file" as const, installDir, version: latest.version };
    }

    if (plugin.source.type === "url") {
        // URL source: install as HTTP MCP server (Streamable HTTP supported by MCP clients).
        const url = String(plugin.source.url || "").trim();
        if (!/^https?:\/\//i.test(url)) {
            throw new Error("该工具 source.url 无效：必须为 http/https URL");
        }

        // Keep pricing/entitlement behavior consistent with other source types.
        await ensureStoreEntitlement({ plugin, token: authToken });

        await mcpStore.addServer({
            type: "http",
            name: plugin.name,
            url,
            enabled: !!params.autoEnable,
            store: {
                slug: plugin.slug,
                kind: "url",
                pricingType: plugin.pricing?.type || "unknown",
                description: pickToolDescription(null, plugin),
            },
        });

        return { kind: "url" as const, url };
    }

    throw new Error("暂不支持该 source 类型安装");
}

export async function updateStoreTool(params: {
    server: McpServer;
    authToken: string | null;
    mcpStore: ReturnType<typeof useMcpStore>;
}) {
    const { server, authToken, mcpStore } = params;

    if (server.type !== "stdio") {
        throw new Error("仅支持更新 stdio 类型工具");
    }

    const slug = server.env?.GLOSC_STORE_SLUG;
    const kind = server.env?.GLOSC_STORE_KIND;
    if (!slug) {
        throw new Error("该工具不是从 Glosc Store 安装的");
    }

    // Package 类型通常由 npx/uvx 解析最新版本（或由工具链缓存控制）。这里仅对 file 版本做更新。
    if (kind !== "file") {
        return {
            ok: true as const,
            updated: false as const,
            reason: "package 类型无需客户端更新（可通过刷新能力验证生效）",
        };
    }

    if (!authToken) {
        throw new Error("请先登录，再更新需要下载的工具");
    }

    const [plugin, versions] = await Promise.all([
        GloscStoreApi.getPlugin(String(slug)),
        GloscStoreApi.getVersions(String(slug)),
    ]);

    const latest = versions.items?.[0];
    if (!latest?.version) {
        throw new Error("该工具暂无可用版本");
    }

    const current = String(server.env?.GLOSC_STORE_VERSION || "").trim();
    if (current && current === latest.version) {
        return {
            ok: true as const,
            updated: false as const,
            version: current,
            latest: latest.version,
        };
    }

    const zipBytes = await GloscStoreApi.downloadVersion({
        slug: String(slug),
        version: latest.version,
        token: authToken,
    });

    const root = await appDataDir();
    const toolsDir = await join(root, "glosc-tools");
    const installDir = await join(toolsDir, String(slug), latest.version);

    await ensureDir(await join(toolsDir, String(slug)));
    await ensureDir(installDir);

    const files = unzipSync(zipBytes);
    const entries = Object.entries(files);

    for (const [rawPath, data] of entries) {
        const rel = normalizeRelPath(rawPath);
        if (!rel) continue;
        if (rel.endsWith("/")) {
            await ensureDir(await join(installDir, rel));
            continue;
        }

        const target = await join(installDir, rel);
        const parent = target.replace(/[\\/][^\\/]+$/, "");
        if (parent && parent !== target) {
            await ensureDir(parent);
        }

        await writeFile(target, data);
    }

    // config.yml (optional)
    let toolConfig: ToolConfig | null = null;
    const configPath = await join(installDir, "config.yml");
    if (await exists(configPath)) {
        const raw = await readFile(configPath);
        const text = new TextDecoder("utf-8").decode(raw);
        toolConfig = (YAML.parse(text) || null) as ToolConfig | null;
        if (toolConfig) validateToolConfig(toolConfig);
    }

    const guessed = await guessEntryFromFilesystem({ installDir, plugin });
    const runtime = toolConfig?.mcp?.runtime || guessed.runtime;
    const entryRel = normalizeRelPath(toolConfig?.mcp?.entry || guessed.entry);
    const cwdRel = normalizeRelPath(toolConfig?.mcp?.cwd || "");

    const entryAbs = await validateToolLayout({
        installDir,
        runtime,
        entryRel,
        cwdRel,
    });
    const cwd = cwdRel ? await join(installDir, cwdRel) : installDir;
    const toolEnv = toolConfig?.mcp?.env || {};
    const extraArgs = toolConfig?.mcp?.args || [];

    const serverName = pickToolName(toolConfig, plugin) || server.name;
    const serverDescription = pickToolDescription(toolConfig, plugin);

    const mergedEnv: Record<string, string> = {
        ...(server.env || {}),
        ...toolEnv,
        GLOSC_STORE_SLUG: String(slug),
        GLOSC_STORE_KIND: "file",
        GLOSC_STORE_VERSION: latest.version,
        GLOSC_STORE_PRICING_TYPE: plugin.pricing?.type || "unknown",
        GLOSC_TOOL_DIR: installDir,
        GLOSC_STORE_DESCRIPTION: serverDescription,
    };

    const command = runtime === "python" ? "python" : "node";

    await mcpStore.updateServer(server.id, {
        name: serverName,
        command,
        args: [entryAbs, ...extraArgs],
        cwd,
        env: mergedEnv,
    });

    return {
        ok: true as const,
        updated: true as const,
        version: latest.version,
        previous: current || null,
        installDir,
    };
}
