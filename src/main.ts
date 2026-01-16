import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";

import "element-plus/theme-chalk/dark/css-vars.css";
import "github-markdown-css/github-markdown.css";
import "./assets/css/main.less";

import { installStoreTool } from "@/utils/StoreToolInstaller";
import {
    decodeBase64Url,
    isMcpServerEqual,
    parseMcpServerConfigs,
    type McpServerImportConfig,
} from "@/utils/McpServerImport";
import { GloscStoreApi } from "@/utils/GloscStoreApi";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);
app.mount("#app");

async function importMcpServersFromConfigs(configs: McpServerImportConfig[]) {
    const mcpStore = useMcpStore(pinia);
    await mcpStore.init();

    let added = 0;
    let updated = 0;

    for (const cfg of configs) {
        // Upsert by (type,name) as the most user-friendly behavior.
        const existing = mcpStore.servers.find(
            (s) => s.type === cfg.type && s.name === cfg.name
        );

        if (existing) {
            if (!isMcpServerEqual(existing, cfg)) {
                await mcpStore.updateServer(existing.id, {
                    ...cfg,
                    enabled: true,
                } as any);
                updated += 1;
            } else if (!existing.enabled) {
                await mcpStore.updateServer(existing.id, { enabled: true });
                updated += 1;
            }
            continue;
        }

        await mcpStore.addServer({
            ...(cfg as any),
            enabled: true,
        });
        added += 1;
    }

    if (added || updated) {
        ElMessage.success(
            `已导入工具：新增 ${added} 个，更新/启用 ${updated} 个`
        );
    } else {
        ElMessage.info("未导入任何工具（可能已存在）");
    }
}

async function importMcpServersFromPayload(payload: unknown) {
    const configs =
        typeof payload === "string" || typeof payload === "object"
            ? parseMcpServerConfigs(payload)
            : [];
    if (!configs.length) {
        ElMessage.error("无效的 MCP 工具配置：未解析到可用项");
        return;
    }
    await importMcpServersFromConfigs(configs);
}

async function installStorePluginBySlug(slug: string) {
    const clean = String(slug || "").trim();
    if (!clean) return;

    const authStore = useAuthStore(pinia);
    await authStore.init();

    const mcpStore = useMcpStore(pinia);
    await mcpStore.init();

    const plugin = await GloscStoreApi.getPlugin(clean);
    await installStoreTool({
        plugin,
        authToken: authStore.token,
        mcpStore,
        autoEnable: true,
    });

    ElMessage.success(`已安装：${plugin.name}`);
}

function parseGloscUrl(arg: string): URL | null {
    try {
        const u = new URL(arg);
        if (u.protocol !== "glosc:") return null;
        return u;
    } catch {
        return null;
    }
}

async function handleStartupImports() {
    // Only meaningful inside Tauri.
    if (!(window as any).__TAURI_INTERNALS__) return;

    try {
        const { invoke } = await import("@tauri-apps/api/core");
        const args = await invoke<string[]>("get_cli_args");

        // 1) glosc:// deep links
        for (const a of args) {
            const u = parseGloscUrl(a);
            if (!u) continue;

            // glosc://install?slug=xxx (store install by slug)
            if (u.hostname === "install") {
                const slug = u.searchParams.get("slug") || "";
                if (slug) {
                    await installStorePluginBySlug(slug);
                    return;
                }
            }

            // glosc://mcp/import?payload=<base64url>
            if (u.hostname === "mcp" && u.pathname === "/import") {
                const payload = u.searchParams.get("payload") || "";
                if (payload) {
                    const json = decodeBase64Url(payload);
                    await importMcpServersFromPayload(json);
                    return;
                }
            }
        }

        // 2) CLI import (explicit)
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === "--import-mcp" && args[i + 1]) {
                await importMcpServersFromPayload(args[i + 1]);
                return;
            }
            if (a === "--import-mcp-base64" && args[i + 1]) {
                const json = decodeBase64Url(args[i + 1]);
                await importMcpServersFromPayload(json);
                return;
            }

            // Compatibility: glosc-copilot plugins install <slug>
            if (a === "plugins" && args[i + 1] === "install" && args[i + 2]) {
                await installStorePluginBySlug(args[i + 2]);
                return;
            }
        }
    } catch (e: any) {
        console.warn("startup import failed", e);
    }
}

function setupConsoleImporter() {
    const w = window as any;
    w.glosc = w.glosc || {};
    w.glosc.importMcp = async (payload: any) => {
        await importMcpServersFromPayload(payload);
    };
    w.glosc.installPlugin = async (slug: string) => {
        await installStorePluginBySlug(slug);
    };
}

setupConsoleImporter();
handleStartupImports();

async function setupProdDevtoolsHotkey() {
    try {
        // When running in a normal browser (vite dev), Tauri internals are not available.
        if (!(window as any).__TAURI_INTERNALS__) return;

        const { invoke } = await import("@tauri-apps/api/core");
        const enabled = await invoke<boolean>("is_debug_enabled");
        if (!enabled) return;

        window.addEventListener(
            "keydown",
            (e) => {
                const isF12 = e.key === "F12";

                if (!isF12) return;

                e.preventDefault();
                invoke("open_devtools").catch(() => {
                    // ignore
                });
            },
            { capture: true }
        );
    } catch {
        // ignore
    }
}

setupProdDevtoolsHotkey();

// 配置 CORSFetch（仅在 Tauri 环境生效）
// 用于绕过浏览器 CORS 限制（例如 Store 下载重定向到 R2 时）。
const corsFetch = (window as any).CORSFetch;
if (corsFetch?.config) {
    corsFetch.config({
        // 仅拦截“下载插件压缩包”相关请求；其它（例如 https://www.glosc.ai 的常规 API）保持走浏览器原生 fetch。
        include: [
            // Store 下载接口（可能是本地开发的 http://localhost:3000，也可能是线上域名）
            /^https?:\/\/[^/]+\/api\/store\/plugins\/[^/]+\/versions\/[^/]+\/download(\?.*)?$/i,
            // R2 产物直链（Store 会 302/307 到这里）
            /^https?:\/\/r2\.glosc\.ai\//i,
        ],
        exclude: [],
    });
}
