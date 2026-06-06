import { defineStore } from "pinia";
import type {
    CustomModelProvider,
    ModelAssignmentKey,
    ModelAssignments,
    ModelInfo,
} from "@/utils/interface";
import { probeThirdPartyModels } from "@/utils/ThirdPartyModelApi";

type ThemeMode = "system" | "dark" | "light";
type AppLanguage = "zh-CN";

const STORE_KEYS = {
    themeMode: "settings_theme_mode",
    language: "settings_language",
    hiddenModelIds: "settings_hidden_model_ids",
    customModelProviders: "settings_custom_model_providers",
    modelAssignments: "settings_model_assignments",
    assistantSystemPrompt: "settings_assistant_system_prompt",
    // builtinToolsEnabled: "settings_builtin_tools_enabled",
    allowedDirectories: "settings_allowed_directories",
} as const;

export type BuiltinToolKind = "filesystem" | "git";
// export type BuiltinToolsEnabled = Record<BuiltinToolKind, boolean>;

const DEFAULT_ASSISTANT_SYSTEM_PROMPT = `你是 Glosc AI Copilot，是用户的私人 AI 助理。

你的工作方式：
- 始终保持专业、可靠、清晰、直接。
- 先理解用户目标，再给出可执行的方案；需要动手时主动使用可用工具完成任务。
- 可以使用当前启用的 MCP 服务：{{mcpList}}。
- 可以调用当前可用工具：{{toolList}}。
- 能帮助用户完成代码阅读与修改、文件与项目整理、资料检索与总结、自动化流程设计、内容创作、问题排查和日常事务协助。
- 涉及不确定信息时明确说明假设；涉及文件、配置或外部操作时优先保证安全与可恢复。`;

function getSystemPrefersDark(): boolean {
    if (typeof window === "undefined") return false;
    return (
        window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false
    );
}

function applyDarkClass(isDark: boolean) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle("dark", isDark);
}

let systemThemeMql: MediaQueryList | null = null;
let systemThemeListenerBound = false;

// 初始化并发守卫：避免 main.ts 与各组件同时触发 init() 导致重复读取 store
let settingsInitPromise: Promise<void> | null = null;

export const useSettingsStore = defineStore("settings", {
    state: () => ({
        initialized: false,
        themeMode: "system" as ThemeMode,
        language: "zh-CN" as AppLanguage,
        hiddenModelIds: [] as string[],

        // 用户自定义（第三方 Key）模型来源配置（本地加密存储）
        customModelProviders: [] as CustomModelProvider[],
        modelAssignments: {} as ModelAssignments,
        assistantSystemPrompt: DEFAULT_ASSISTANT_SYSTEM_PROMPT,

        // 允许工具访问的目录（安全边界）；文件/Git 工具会强制校验。
        allowedDirectories: [] as string[],
    }),

    getters: {
        hiddenModelIdSet(state): Set<string> {
            return new Set(state.hiddenModelIds || []);
        },
        effectiveTheme(state): Exclude<ThemeMode, "system"> {
            if (state.themeMode === "dark" || state.themeMode === "light") {
                return state.themeMode;
            }
            return getSystemPrefersDark() ? "dark" : "light";
        },
    },

    actions: {
        async init() {
            if (this.initialized) return;
            // 复用进行中的初始化 Promise，确保并发调用只执行一次
            if (settingsInitPromise) return settingsInitPromise;

            settingsInitPromise = this.runInit();
            try {
                await settingsInitPromise;
            } finally {
                settingsInitPromise = null;
            }
        },

        async runInit() {
            const [
                themeMode,
                language,
                hiddenModelIds,
                customModelProviders,
                modelAssignments,
                assistantSystemPrompt,
            ] = await Promise.all([
                    storeUtils.get<ThemeMode>(STORE_KEYS.themeMode),
                    storeUtils.get<AppLanguage>(STORE_KEYS.language),
                    storeUtils.get<string[]>(STORE_KEYS.hiddenModelIds),
                    storeUtils.get<CustomModelProvider[]>(
                        STORE_KEYS.customModelProviders,
                    ),
                    storeUtils.get<ModelAssignments>(
                        STORE_KEYS.modelAssignments,
                    ),
                    storeUtils.get<string>(STORE_KEYS.assistantSystemPrompt),
                ]);

            if (
                themeMode === "system" ||
                themeMode === "dark" ||
                themeMode === "light"
            ) {
                this.themeMode = themeMode;
            }
            if (language === "zh-CN") {
                this.language = language;
            }
            if (Array.isArray(hiddenModelIds)) {
                this.hiddenModelIds = hiddenModelIds.filter(
                    (x) => typeof x === "string" && x.trim(),
                );
            }

            if (Array.isArray(customModelProviders)) {
                // 轻量清洗，避免不合法数据卡死
                this.customModelProviders = customModelProviders
                    .map((p: any) => {
                        const now = Date.now();
                        const legacyProvider = String(p?.provider || "").trim();
                        const legacyDefaultBaseUrl =
                            legacyProvider === "qwen"
                                ? "https://dashscope.aliyuncs.com/compatible-mode/v1"
                                : legacyProvider === "openai"
                                  ? "https://api.openai.com/v1"
                                  : "https://api.openai.com/v1";

                        const baseUrl =
                            typeof p?.baseUrl === "string" && p.baseUrl.trim()
                                ? p.baseUrl
                                : legacyDefaultBaseUrl;
                        return {
                            id: String(p?.id || "").trim(),
                            name: String(p?.name || "").trim() || "未命名",
                            enabled: Boolean(p?.enabled),
                            apiKey: String(p?.apiKey || ""),
                            baseUrl,
                            models: Array.isArray(p?.models)
                                ? (p.models as any)
                                : undefined,
                            lastValidatedAt:
                                typeof p?.lastValidatedAt === "number"
                                    ? p.lastValidatedAt
                                    : undefined,
                            createdAt:
                                typeof p?.createdAt === "number"
                                    ? p.createdAt
                                    : now,
                            updatedAt:
                                typeof p?.updatedAt === "number"
                                    ? p.updatedAt
                                    : now,
                        } as CustomModelProvider;
                    })
                    .filter((p) => Boolean(p.id));
            }

            if (modelAssignments && typeof modelAssignments === "object") {
                const clean: ModelAssignments = {};
                for (const key of [
                    "chat",
                    "tool",
                    "conversationOrganizer",
                    "skills",
                ] as ModelAssignmentKey[]) {
                    const value = String((modelAssignments as any)[key] || "");
                    if (value.trim()) clean[key] = value.trim();
                }
                this.modelAssignments = clean;
            }

            if (typeof assistantSystemPrompt === "string") {
                this.assistantSystemPrompt = assistantSystemPrompt.trim()
                    ? assistantSystemPrompt
                    : DEFAULT_ASSISTANT_SYSTEM_PROMPT;
            }

            this.initialized = true;
            this.applyTheme();
            this.ensureSystemThemeListener();
        },

        // ============ 自定义模型提供方（第三方 Key）===========
        async persistCustomModelProviders() {
            await storeUtils.set(
                STORE_KEYS.customModelProviders,
                this.customModelProviders,
                true,
            );
        },

        getCustomModelProviderById(id: string): CustomModelProvider | null {
            const clean = String(id || "").trim();
            if (!clean) return null;
            return (
                (this.customModelProviders || []).find((p) => p.id === clean) ||
                null
            );
        },

        async upsertCustomModelProvider(next: CustomModelProvider) {
            const now = Date.now();
            const cleanId = String(next?.id || "").trim();
            if (!cleanId) return;

            const baseUrl = String((next as any)?.baseUrl || "").trim();
            if (!baseUrl) {
                throw new Error("Base URL 不能为空");
            }

            const normalized: CustomModelProvider = {
                ...next,
                id: cleanId,
                name: String(next?.name || "").trim() || "未命名",
                enabled: Boolean(next?.enabled),
                apiKey: String(next?.apiKey || ""),
                baseUrl,
                models: Array.isArray(next?.models) ? next.models : undefined,
                createdAt:
                    typeof next?.createdAt === "number" ? next.createdAt : now,
                updatedAt: now,
                lastValidatedAt:
                    typeof (next as any)?.lastValidatedAt === "number"
                        ? (next as any).lastValidatedAt
                        : undefined,
            };

            const list = [...(this.customModelProviders || [])];
            const idx = list.findIndex((p) => p.id === cleanId);
            if (idx >= 0) list[idx] = normalized;
            else list.push(normalized);
            this.customModelProviders = list;
            await this.persistCustomModelProviders();
        },

        async removeCustomModelProvider(id: string) {
            const clean = String(id || "").trim();
            if (!clean) return;
            this.customModelProviders = (
                this.customModelProviders || []
            ).filter((p) => p.id !== clean);
            await this.persistCustomModelProviders();
        },

        async setCustomModelProviderEnabled(id: string, enabled: boolean) {
            const p = this.getCustomModelProviderById(id);
            if (!p) return;
            await this.upsertCustomModelProvider({
                ...p,
                enabled: Boolean(enabled),
            });
        },

        async probeAndUpdateCustomModelProviderModels(id: string) {
            const p = this.getCustomModelProviderById(id);
            if (!p) return [] as ModelInfo[];

            const models = await probeThirdPartyModels({
                apiKey: p.apiKey,
                baseUrl: p.baseUrl,
            });

            await this.upsertCustomModelProvider({
                ...p,
                models,
                lastValidatedAt: Date.now(),
            } as any);

            return models;
        },

        getCustomSelectableModels(): ModelInfo[] {
            const providers = (this.customModelProviders || []).filter(
                (p) => p.enabled,
            );
            const out: ModelInfo[] = [];

            for (const p of providers) {
                for (const m of p.models || []) {
                    const rawId = String((m as any)?.id || "").trim();
                    if (!rawId) continue;
                    const encoded = encodeURIComponent(rawId);
                    out.push({
                        ...(m as any),
                        id: `custom/${p.id}/${encoded}`,
                        owned_by:
                            String(p.name || "自定义模型").trim() ||
                            "自定义模型",
                        tags: Array.from(
                            new Set([
                                ...(((m as any).tags || []) as string[]),
                                "OpenAI兼容",
                                `组:${p.name}`,
                            ]),
                        ),
                        pricing: (m as any).pricing || {},
                    } as ModelInfo);
                }
            }
            return out;
        },

        // ============ 其他设置 ============
        async setAllowedDirectories(dirs: string[]) {
            this.allowedDirectories = (dirs || [])
                .map((x) => String(x || "").trim())
                .filter(Boolean);
            await storeUtils.set(
                STORE_KEYS.allowedDirectories,
                this.allowedDirectories,
                true,
            );
        },

        async addAllowedDirectory(dir: string) {
            const d = String(dir || "").trim();
            if (!d) return;
            const next = new Set(this.allowedDirectories || []);
            next.add(d);
            await this.setAllowedDirectories(Array.from(next));
        },

        async removeAllowedDirectory(dir: string) {
            const d = String(dir || "").trim();
            if (!d) return;
            const next = new Set(this.allowedDirectories || []);
            next.delete(d);
            await this.setAllowedDirectories(Array.from(next));
        },

        applyTheme() {
            const isDark = this.effectiveTheme === "dark";
            applyDarkClass(isDark);
        },

        ensureSystemThemeListener() {
            if (typeof window === "undefined") return;
            if (systemThemeListenerBound) return;
            if (!window.matchMedia) return;

            systemThemeMql = window.matchMedia("(prefers-color-scheme: dark)");
            const handler = () => {
                if (this.themeMode !== "system") return;
                this.applyTheme();
            };

            try {
                systemThemeMql.addEventListener("change", handler);
            } catch {
                (systemThemeMql as any)?.addListener?.(handler);
            }
            systemThemeListenerBound = true;
        },

        async setThemeMode(mode: ThemeMode) {
            this.themeMode = mode;
            await storeUtils.set(STORE_KEYS.themeMode, mode, true);
            this.applyTheme();
        },

        async setLanguage(lang: AppLanguage) {
            this.language = lang;
            await storeUtils.set(STORE_KEYS.language, lang, true);
        },

        async setAssistantSystemPrompt(prompt: string) {
            const next = String(prompt ?? "");
            this.assistantSystemPrompt = next;
            await storeUtils.set(
                STORE_KEYS.assistantSystemPrompt,
                next,
                true,
            );
        },

        async resetAssistantSystemPrompt() {
            this.assistantSystemPrompt = DEFAULT_ASSISTANT_SYSTEM_PROMPT;
            await storeUtils.set(
                STORE_KEYS.assistantSystemPrompt,
                DEFAULT_ASSISTANT_SYSTEM_PROMPT,
                true,
            );
        },

        getAssignedModelId(key: ModelAssignmentKey): string | null {
            const modelId = String(this.modelAssignments?.[key] || "").trim();
            return modelId || null;
        },

        async setAssignedModelId(
            key: ModelAssignmentKey,
            modelId: string | null,
        ) {
            const next: ModelAssignments = { ...(this.modelAssignments || {}) };
            const clean = String(modelId || "").trim();
            if (clean) next[key] = clean;
            else delete next[key];
            this.modelAssignments = next;
            await storeUtils.set(STORE_KEYS.modelAssignments, next, true);
        },

        isModelHidden(modelId: string): boolean {
            if (!modelId) return false;
            return this.hiddenModelIdSet.has(modelId);
        },

        async setModelHidden(modelId: string, hidden: boolean) {
            const id = String(modelId || "").trim();
            if (!id) return;
            const next = new Set(this.hiddenModelIds || []);
            if (hidden) next.add(id);
            else next.delete(id);
            this.hiddenModelIds = Array.from(next);
            await storeUtils.set(
                STORE_KEYS.hiddenModelIds,
                this.hiddenModelIds,
                true,
            );
        },

        async hideModels(modelIds: string[]) {
            const next = new Set(this.hiddenModelIds || []);
            for (const id of modelIds || []) {
                const clean = String(id || "").trim();
                if (clean) next.add(clean);
            }
            this.hiddenModelIds = Array.from(next);
            await storeUtils.set(
                STORE_KEYS.hiddenModelIds,
                this.hiddenModelIds,
                true,
            );
        },

        async showModels(modelIds: string[]) {
            const next = new Set(this.hiddenModelIds || []);
            for (const id of modelIds || []) {
                const clean = String(id || "").trim();
                if (clean) next.delete(clean);
            }
            this.hiddenModelIds = Array.from(next);
            await storeUtils.set(
                STORE_KEYS.hiddenModelIds,
                this.hiddenModelIds,
                true,
            );
        },

        async showAllModels() {
            this.hiddenModelIds = [];
            await storeUtils.set(STORE_KEYS.hiddenModelIds, [], true);
        },
    },
});
