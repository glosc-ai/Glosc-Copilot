import { defineStore } from "pinia";

type ThemeMode = "system" | "dark" | "light";
type AppLanguage = "zh-CN";

const STORE_KEYS = {
    themeMode: "settings_theme_mode",
    language: "settings_language",
    hiddenModelIds: "settings_hidden_model_ids",
} as const;

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

export const useSettingsStore = defineStore("settings", {
    state: () => ({
        initialized: false,
        themeMode: "system" as ThemeMode,
        language: "zh-CN" as AppLanguage,
        hiddenModelIds: [] as string[],
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

            const [themeMode, language, hiddenModelIds] = await Promise.all([
                storeUtils.get<ThemeMode>(STORE_KEYS.themeMode),
                storeUtils.get<AppLanguage>(STORE_KEYS.language),
                storeUtils.get<string[]>(STORE_KEYS.hiddenModelIds),
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

            this.initialized = true;
            this.applyTheme();
            this.ensureSystemThemeListener();
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
                // 仅在“跟随系统”时响应系统变化
                if (this.themeMode !== "system") return;
                this.applyTheme();
            };

            // addEventListener is standard; addListener is legacy fallback
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
