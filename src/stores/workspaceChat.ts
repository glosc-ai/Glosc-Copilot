import { defineStore } from "pinia";

import { fetchAvailableModels } from "@/utils/ModelApi";
import { storeUtils } from "@/utils/StoreUtils";
import type {
    ConversationItem,
    StoredChatMessage,
    ModelInfo,
} from "@/utils/interface";

export type WorkspaceChatApiMode = "chat" | "agent";
export type WorkspaceFileContextMode = "none" | "list" | "contents";

export type WorkspaceBuiltinToolKind = "filesystem" | "git";
// export type WorkspaceBuiltinToolsEnabled = Record<
//     WorkspaceBuiltinToolKind,
//     boolean
// >;

export type WorkspaceConversation = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: StoredChatMessage[];

    // workspace-bound settings
    workspaceId: string;
    workspaceRoot: string;

    modelId?: string;
    enabledMcpServerIds?: string[];
    // enabledBuiltinTools?: WorkspaceBuiltinToolsEnabled;
    webSearch?: boolean;
    apiMode?: WorkspaceChatApiMode;

    // prompt/context settings
    customInstructions?: string;
    fileContextMode?: WorkspaceFileContextMode;
    agentSkillsEnabled?: boolean;
};

function toBase64Url(input: string): string {
    // UTF-8 -> base64url (browser-safe)
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeWorkspaceRoot(root: string): string {
    // Keep as-is but trim and normalize trailing separators.
    let r = (root || "").trim();
    if (!r) return r;

    // Normalize to no trailing slash/backslash
    while (r.length > 1 && (r.endsWith("/") || r.endsWith("\\"))) {
        r = r.slice(0, -1);
    }

    return r;
}

function workspaceIdFromRoot(root: string): string {
    const normalized = normalizeWorkspaceRoot(root);
    // Limit id length to keep storage keys manageable
    const id = toBase64Url(normalized);
    return id.slice(0, 64);
}

export const useWorkspaceChatStore = defineStore("workspaceChat", {
    state: () => ({
        // current workspace
        workspaceRoot: null as string | null,
        workspaceId: null as string | null,

        // session list
        conversationsItems: [] as ConversationItem[],
        conversations: {} as Record<string, WorkspaceConversation>,
        loadedConversationIds: {} as Record<string, boolean>,
        activeKey: "",

        // models
        availableModels: [] as ModelInfo[],
        selectedModel: null as ModelInfo | null,
        isLoadingModels: false,
        modelsError: null as string | null,

        // init
        isInitialized: false,
    }),

    getters: {
        hasWorkspace(state) {
            return Boolean(state.workspaceRoot && state.workspaceId);
        },
    },

    actions: {
        // ---------- storage keys ----------
        wsIndexKey(wsId: string) {
            return `ws_chat_index_v1:${wsId}`;
        },
        wsConversationKey(wsId: string, conversationId: string) {
            return `ws_chat_conv_v1:${wsId}:${conversationId}`;
        },
        wsSelectedModelKey(wsId: string) {
            return `ws_chat_selected_model_id:${wsId}`;
        },
        wsActiveKeyKey(wsId: string) {
            return `ws_chat_active_key:${wsId}`;
        },

        // ---------- workspace binding ----------
        async setWorkspaceRoot(root: string | null) {
            const normalized = root ? normalizeWorkspaceRoot(root) : null;
            if (!normalized) {
                this.workspaceRoot = null;
                this.workspaceId = null;
                this.conversationsItems = [];
                this.conversations = {};
                this.loadedConversationIds = {};
                this.activeKey = "";
                return;
            }

            const wsId = workspaceIdFromRoot(normalized);
            const same = this.workspaceId === wsId;

            this.workspaceRoot = normalized;
            this.workspaceId = wsId;

            if (!same) {
                this.conversationsItems = [];
                this.conversations = {};
                this.loadedConversationIds = {};
                this.activeKey = "";
            }

            await this.loadConversationsIndex();

            const persistedActive = await storeUtils.get<string>(
                this.wsActiveKeyKey(wsId),
            );
            if (
                persistedActive &&
                this.conversationsItems.some((it) => it.key === persistedActive)
            ) {
                this.activeKey = persistedActive;
            }

            // Ensure models are available
            if (this.availableModels.length === 0) {
                await this.loadAvailableModels();
            }

            // Restore workspace-bound default model selection
            await this.loadPersistedSelectedModelId();

            this.isInitialized = true;
        },

        async loadConversationsIndex() {
            if (!this.workspaceId) return;

            const index = await storeUtils.get<{
                version: number;
                items: ConversationItem[];
                order?: string[];
            }>(this.wsIndexKey(this.workspaceId));

            if (index && index.version === 1 && Array.isArray(index.items)) {
                const order =
                    Array.isArray(index.order) && index.order.length > 0
                        ? index.order
                        : index.items.map((it) => it.key);
                const map = new Map(index.items.map((it) => [it.key, it]));
                this.conversationsItems = order
                    .map((id) => map.get(id))
                    .filter(Boolean) as ConversationItem[];
                this.conversations = {};
                this.loadedConversationIds = {};
                return;
            }

            // fallback empty
            this.conversationsItems = [];
            this.conversations = {};
            this.loadedConversationIds = {};
        },

        async persistIndex() {
            if (!this.workspaceId) return;
            const order = this.conversationsItems.map((it) => it.key);
            await storeUtils.set(
                this.wsIndexKey(this.workspaceId),
                { version: 1, items: this.conversationsItems, order },
                true,
            );
        },

        async ensureConversationLoaded(conversationId: string) {
            if (!this.workspaceId) return;
            if (!conversationId) return;
            if (this.loadedConversationIds[conversationId]) return;

            const stored = await storeUtils.get<WorkspaceConversation>(
                this.wsConversationKey(this.workspaceId, conversationId),
            );

            if (stored && stored.id === conversationId) {
                this.conversations = {
                    ...this.conversations,
                    [conversationId]: stored,
                };
                this.loadedConversationIds = {
                    ...this.loadedConversationIds,
                    [conversationId]: true,
                };
                return;
            }

            // If missing, create a minimal placeholder in-memory
            const now = Date.now();
            const root = this.workspaceRoot || "";
            const wsId = this.workspaceId;
            const conv: WorkspaceConversation = {
                id: conversationId,
                title: "未命名会话",
                createdAt: now,
                updatedAt: now,
                messages: [],
                workspaceId: wsId,
                workspaceRoot: root,
                fileContextMode: "none",
                agentSkillsEnabled: true,
                apiMode: "agent",
                enabledMcpServerIds: [],
                // enabledBuiltinTools: { filesystem: false, git: false },
            };

            this.conversations = {
                ...this.conversations,
                [conversationId]: conv,
            };
            this.loadedConversationIds = {
                ...this.loadedConversationIds,
                [conversationId]: true,
            };
        },

        async createNewConversation() {
            if (!this.workspaceId || !this.workspaceRoot) {
                throw new Error("未选择工作区");
            }

            const id = crypto.randomUUID();
            const now = Date.now();

            const conv: WorkspaceConversation = {
                id,
                title: "新会话",
                createdAt: now,
                updatedAt: now,
                messages: [],
                workspaceId: this.workspaceId,
                workspaceRoot: this.workspaceRoot,

                modelId: this.selectedModel?.id,
                enabledMcpServerIds: [],
                // enabledBuiltinTools: { filesystem: false, git: false },
                webSearch: false,
                apiMode: "agent",

                customInstructions: "",
                fileContextMode: "none",
                agentSkillsEnabled: true,
            };

            const item: ConversationItem = {
                key: id,
                label: conv.title,
                timestamp: now,
                messageCount: 0,
            };

            this.conversationsItems = [item, ...this.conversationsItems];
            this.conversations = { ...this.conversations, [id]: conv };
            this.loadedConversationIds = {
                ...this.loadedConversationIds,
                [id]: true,
            };

            await storeUtils.set(
                this.wsConversationKey(this.workspaceId, id),
                conv,
                true,
            );
            await this.persistIndex();

            return id;
        },

        async selectConversation(conversationId: string) {
            if (!this.workspaceId) return;
            this.activeKey = conversationId;
            await storeUtils.set(
                this.wsActiveKeyKey(this.workspaceId),
                conversationId,
                true,
            );
            await this.ensureConversationLoaded(conversationId);
        },

        async renameConversation(conversationId: string, title: string) {
            if (!this.workspaceId) return;
            const nextTitle = title.trim();
            if (!nextTitle) return;

            const items = this.conversationsItems.map((it) =>
                it.key === conversationId ? { ...it, label: nextTitle } : it,
            );
            this.conversationsItems = items;

            await this.ensureConversationLoaded(conversationId);
            const conv = this.conversations[conversationId];
            if (conv) {
                conv.title = nextTitle;
                await storeUtils.set(
                    this.wsConversationKey(this.workspaceId, conversationId),
                    conv,
                    true,
                );
            }

            await this.persistIndex();
        },

        async deleteConversation(conversationId: string) {
            if (!this.workspaceId) return;

            const nextItems = this.conversationsItems.filter(
                (it) => it.key !== conversationId,
            );
            this.conversationsItems = nextItems;

            const nextConvs = { ...this.conversations };
            delete nextConvs[conversationId];
            this.conversations = nextConvs;

            const nextLoaded = { ...this.loadedConversationIds };
            delete nextLoaded[conversationId];
            this.loadedConversationIds = nextLoaded;

            await storeUtils.delete(
                this.wsConversationKey(this.workspaceId, conversationId),
            );
            await this.persistIndex();

            if (this.activeKey === conversationId) {
                this.activeKey = nextItems[0]?.key || "";
                await storeUtils.set(
                    this.wsActiveKeyKey(this.workspaceId),
                    this.activeKey,
                    true,
                );
            }
        },

        // ---------- message persistence ----------
        async updateConversation(
            conversationId: string,
            patch: Partial<WorkspaceConversation>,
        ) {
            if (!this.workspaceId) return;
            await this.ensureConversationLoaded(conversationId);
            const current = this.conversations[conversationId];
            if (!current) return;

            const next: WorkspaceConversation = {
                ...current,
                ...patch,
                updatedAt: Date.now(),
            };

            this.conversations = {
                ...this.conversations,
                [conversationId]: next,
            };

            const itemIndex = this.conversationsItems.findIndex(
                (it) => it.key === conversationId,
            );
            if (itemIndex >= 0) {
                const nextItems = [...this.conversationsItems];
                nextItems[itemIndex] = {
                    ...nextItems[itemIndex],
                    label: next.title,
                    timestamp: next.updatedAt,
                    messageCount: next.messages.length,
                };
                this.conversationsItems = nextItems;
            }

            await storeUtils.set(
                this.wsConversationKey(this.workspaceId, conversationId),
                next,
                true,
            );
            await this.persistIndex();
        },

        // ---------- models (workspace-bound default) ----------
        async loadPersistedSelectedModelId() {
            if (!this.workspaceId) return null;
            try {
                const id = await storeUtils.get<string>(
                    this.wsSelectedModelKey(this.workspaceId),
                );
                if (id && this.availableModels.length > 0) {
                    const found = this.availableModels.find((m) => m.id === id);
                    if (found) this.selectedModel = found;
                }
                return id;
            } catch {
                return null;
            }
        },

        async persistSelectedModelId(modelId: string | null) {
            if (!this.workspaceId) return;
            if (!modelId) {
                await storeUtils.delete(
                    this.wsSelectedModelKey(this.workspaceId),
                );
                return;
            }
            await storeUtils.set(
                this.wsSelectedModelKey(this.workspaceId),
                modelId,
                true,
            );
        },

        async loadAvailableModels() {
            this.isLoadingModels = true;
            this.modelsError = null;
            try {
                this.availableModels = await fetchAvailableModels();

                if (this.availableModels.length > 0) {
                    const persisted = await this.loadPersistedSelectedModelId();
                    const desiredId = this.selectedModel?.id || persisted;
                    const defaultModelId = "xai/grok-code-fast-1";

                    const resolved = desiredId
                        ? this.availableModels.find((m) => m.id === desiredId)
                        : undefined;
                    const fallbackDefault = this.availableModels.find(
                        (m) => m.id === defaultModelId,
                    );

                    this.selectedModel =
                        resolved || fallbackDefault || this.availableModels[0];

                    await this.persistSelectedModelId(
                        this.selectedModel?.id || null,
                    );
                }
            } catch (error) {
                this.modelsError =
                    error instanceof Error ? error.message : "加载模型失败";
            } finally {
                this.isLoadingModels = false;
            }
        },

        selectModel(model: ModelInfo | null) {
            this.selectedModel = model;
            void this.persistSelectedModelId(model?.id || null);
        },
    },
});
