import { defineStore } from "pinia";
import OpenAI from "openai";

import { fetchAvailableModels } from "../utils/ModelApi";
import { storeUtils } from "../utils/StoreUtils";
import type { AttachmentFile } from "@/components/ai-elements/prompt-input";
import type {
    Conversation,
    ConversationItem,
    StoredChatMessage,
} from "../utils/interface";

export const useChatStore = defineStore("chat", {
    state: () => ({
        headerOpen: false,
        settingsOpen: false,
        content: "",
        // 是否启用 Web 搜索（透传给后端）
        webSearchEnabled: false,
        // 会话相关
        conversations: {} as Record<string, Conversation>,
        // 是否已加载过会话内容（避免启动时把所有 messages 拉进来）
        loadedConversationIds: {} as Record<string, boolean>,
        conversationsItems: [] as ConversationItem[],
        activeKey: "",
        attachedFiles: [] as AttachmentFile[],
        // 模型相关
        availableModels: [] as ModelInfo[],
        selectedModel: null as ModelInfo | null,
        isLoadingModels: false,
        modelsError: null as string | null,
        // 最近使用模型（modelId -> timestamp）
        recentModelUsage: {} as Record<string, number>,
        recentModelUsageLoaded: false,
        // 初始化状态
        isInitialized: false,
        // 存储优化
        hasPendingChanges: false,
        indexDirty: false,
        pendingConversationIds: {} as Record<string, boolean>,
        saveTimer: null as any,
    }),
    getters: {
        // 按日期分组的会话列表
        groupedConversations: (state) => {
            const groups: Record<string, ConversationItem[]> = {};
            const now = new Date();
            const today = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
            );
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            state.conversationsItems.forEach((item) => {
                // 启动时不加载完整会话内容，分组/排序只依赖索引元数据
                const date = new Date(item.timestamp || 0);
                let dateKey: string;

                if (date >= today) {
                    dateKey = "今天";
                } else if (date >= yesterday) {
                    dateKey = "昨天";
                } else {
                    dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
                }

                if (!groups[dateKey]) {
                    groups[dateKey] = [];
                }
                groups[dateKey].push(item);
            });

            // 按日期排序：今天、昨天，然后按日期降序
            const sortedGroups: Record<string, ConversationItem[]> = {};
            const keys = Object.keys(groups).sort((a, b) => {
                if (a === "今天") return -1;
                if (b === "今天") return 1;
                if (a === "昨天") return -1;
                if (b === "昨天") return 1;
                return b.localeCompare(a); // 日期降序
            });

            keys.forEach((key) => {
                sortedGroups[key] = groups[key].sort((a, b) => {
                    return (b.timestamp || 0) - (a.timestamp || 0);
                });
            });

            return sortedGroups;
        },
    },
    actions: {
        chatIndexKey() {
            return "chat_index_v2";
        },
        chatConversationKey(id: string) {
            return `chat_conv_v2:${id}`;
        },

        // ============ WebSearch 开关（可选，全局） ============
        async loadWebSearchEnabled() {
            try {
                const value = await storeUtils.get<boolean>(
                    "chat_web_search_enabled",
                );
                this.webSearchEnabled = Boolean(value);
            } catch (error) {
                console.error("加载 webSearch 开关失败:", error);
                this.webSearchEnabled = false;
            }
        },

        async setWebSearchEnabled(enabled: boolean) {
            try {
                this.webSearchEnabled = Boolean(enabled);
                await storeUtils.set(
                    "chat_web_search_enabled",
                    this.webSearchEnabled,
                    false,
                );
            } catch (error) {
                console.error("保存 webSearch 开关失败:", error);
            }
        },

        async loadRecentModelUsage() {
            try {
                const data = await storeUtils.get<Record<string, number>>(
                    "chat_recent_model_usage",
                );
                this.recentModelUsage = data || {};
                this.recentModelUsageLoaded = true;
            } catch (error) {
                console.error("加载最近使用模型失败:", error);
                this.recentModelUsage = {};
                this.recentModelUsageLoaded = true;
            }
        },

        async persistRecentModelUsage() {
            try {
                // 只保留最近 50 条，避免无限增长
                const entries = Object.entries(this.recentModelUsage).sort(
                    (a, b) => (b[1] || 0) - (a[1] || 0),
                );
                const next: Record<string, number> = {};
                for (const [modelId, ts] of entries.slice(0, 50)) {
                    if (!modelId) continue;
                    if (typeof ts !== "number" || !Number.isFinite(ts))
                        continue;
                    next[modelId] = ts;
                }
                this.recentModelUsage = next;
                await storeUtils.set("chat_recent_model_usage", next, false);
            } catch (error) {
                console.error("保存最近使用模型失败:", error);
            }
        },

        markModelUsed(modelId: string | null | undefined) {
            if (!modelId) return;
            // 若未加载过，则先标记到内存，异步补加载也不会影响当前写入
            if (!this.recentModelUsageLoaded) {
                void this.loadRecentModelUsage();
            }

            this.recentModelUsage = {
                ...this.recentModelUsage,
                [modelId]: Date.now(),
            };
            void this.persistRecentModelUsage();
        },

        removeRecentModel(modelId: string) {
            if (!this.recentModelUsageLoaded) {
                void this.loadRecentModelUsage();
            }

            const next = { ...this.recentModelUsage };
            delete next[modelId];
            this.recentModelUsage = next;
            void this.persistRecentModelUsage();
        },

        async loadPersistedSelectedModelId() {
            try {
                return await storeUtils.get<string>("chat_selected_model_id");
            } catch (error) {
                console.error("加载已选模型失败:", error);
                return null;
            }
        },

        async persistSelectedModelId(modelId: string | null) {
            try {
                if (!modelId) {
                    await storeUtils.delete("chat_selected_model_id");
                    return;
                }
                await storeUtils.set("chat_selected_model_id", modelId, false);
            } catch (error) {
                console.error("保存已选模型失败:", error);
            }
        },

        // ============ 初始化 ============
        async init() {
            if (this.isInitialized) return;

            try {
                // 加载全局设置
                await this.loadWebSearchEnabled();

                // 加载会话数据
                await this.loadConversations();

                // 不自动选中会话，保持 activeKey 为空以显示欢迎页面
                // 如果需要，可以手动选择会话

                this.isInitialized = true;
            } catch (error) {
                console.error("初始化失败:", error);
            }
        },

        // ============ 会话管理 ============
        async loadConversations() {
            try {
                // v2：先尝试仅加载会话索引（元数据）
                const index = await storeUtils.get<{
                    version: number;
                    items: ConversationItem[];
                    order?: string[];
                }>(this.chatIndexKey());

                if (
                    index &&
                    index.version === 2 &&
                    Array.isArray(index.items)
                ) {
                    const order =
                        Array.isArray(index.order) && index.order.length > 0
                            ? index.order
                            : index.items.map((it) => it.key);
                    const map = new Map(index.items.map((it) => [it.key, it]));
                    this.conversationsItems = order
                        .map((id) => map.get(id))
                        .filter(Boolean) as ConversationItem[];

                    // 启动不加载 conversations 内容，避免读取海量 messages
                    this.conversations = {};
                    this.loadedConversationIds = {};
                    return;
                }

                // v1 迁移：旧结构在 chat_data 中一次性存全量 messages
                const legacy = await storeUtils.get<{
                    conversations: Record<string, Conversation>;
                    conversationsOrder: string[];
                }>("chat_data");

                if (legacy && legacy.conversations) {
                    const legacyConversations = legacy.conversations || {};
                    const hasPersistedOrder =
                        Array.isArray(legacy.conversationsOrder) &&
                        legacy.conversationsOrder.length > 0;
                    const order = hasPersistedOrder
                        ? legacy.conversationsOrder
                        : Object.keys(legacyConversations);

                    const items: ConversationItem[] = order
                        .filter((id) => legacyConversations[id])
                        .map((id) => ({
                            key: id,
                            label: legacyConversations[id].title,
                            timestamp: legacyConversations[id].updatedAt,
                            messageCount:
                                legacyConversations[id].messages?.length ?? 0,
                        }));

                    this.conversationsItems = hasPersistedOrder
                        ? items
                        : items.sort(
                              (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
                          );

                    // 分片保存：每个会话单独一个 key + 索引 key
                    const entries: Array<{
                        key: string;
                        value: any;
                        encrypt?: boolean;
                    }> = [];
                    for (const [id, conv] of Object.entries(
                        legacyConversations,
                    )) {
                        if (!id || !conv) continue;
                        entries.push({
                            key: this.chatConversationKey(id),
                            value: conv,
                        });
                    }
                    entries.push({
                        key: this.chatIndexKey(),
                        value: {
                            version: 2,
                            items: this.conversationsItems,
                            order: this.conversationsItems.map((it) => it.key),
                        },
                    });

                    await storeUtils.setMany(entries);
                    // 删除旧 key，避免后续启动继续读大对象
                    await storeUtils.delete("chat_data");

                    // 迁移完成后，不把全量 conversations 留在内存
                    this.conversations = {};
                    this.loadedConversationIds = {};
                    return;
                }

                // 全新：没有任何数据
                this.conversations = {};
                this.loadedConversationIds = {};
                this.conversationsItems = [];
                await this.createNewConversation(false);
            } catch (error) {
                console.error("加载会话失败:", error);
            }
        },

        async ensureConversationLoaded(id: string) {
            if (!id) return;
            if (this.loadedConversationIds[id] && this.conversations[id])
                return;

            try {
                const conv = await storeUtils.get<Conversation>(
                    this.chatConversationKey(id),
                );
                if (conv) {
                    const item = this.conversationsItems.find(
                        (it) => it.key === id,
                    );
                    if (item?.label && conv.title !== item.label) {
                        conv.title = item.label;
                        this.pendingConversationIds = {
                            ...this.pendingConversationIds,
                            [id]: true,
                        };
                        this.hasPendingChanges = true;
                    }
                    if (
                        typeof item?.timestamp === "number" &&
                        Number.isFinite(item.timestamp) &&
                        item.timestamp > (conv.updatedAt || 0)
                    ) {
                        conv.updatedAt = item.timestamp;
                        this.pendingConversationIds = {
                            ...this.pendingConversationIds,
                            [id]: true,
                        };
                        this.hasPendingChanges = true;
                    }
                    this.conversations[id] = conv;
                    this.loadedConversationIds[id] = true;
                    return;
                }
            } catch (error) {
                console.warn("加载会话内容失败:", id, error);
            }

            // 找不到时，创建一个最小占位（避免 UI 崩溃）
            const item = this.conversationsItems.find((it) => it.key === id);
            const now = Date.now();
            this.conversations[id] = {
                id,
                title: item?.label || "新对话",
                messages: [],
                createdAt: item?.timestamp || now,
                updatedAt: item?.timestamp || now,
                modelId: this.selectedModel?.id,
            };
            this.loadedConversationIds[id] = true;
        },

        async selectConversation(id: string) {
            if (!id) {
                this.activeKey = "";
                return;
            }
            await this.ensureConversationLoaded(id);
            this.activeKey = id;
        },

        /**
         * 根据第一条用户消息自动生成标题（同步版：只更新 state，不触发保存）。
         * 返回 true 表示发生了标题变更。
         */
        applyAutoTitle(conversationId: string) {
            const conversation = this.conversations[conversationId];
            if (!conversation) return false;

            if (
                conversation.title !== "新对话" &&
                !conversation.title.startsWith("新对话 ")
            ) {
                return false;
            }

            const firstUserMsg = conversation.messages.find(
                (msg) => msg.role === "user",
            );
            if (!firstUserMsg) return false;

            let title = firstUserMsg.content.trim().substring(0, 30);
            if (firstUserMsg.content.length > 30) {
                title += "...";
            }

            if (!title) return false;

            conversation.title = title;

            const item = this.conversationsItems.find(
                (it) => it.key === conversationId,
            );
            if (item) {
                item.label = title;
            }

            return true;
        },

        /**
         * 拖拽排序：把 sourceKey 移动到 targetKey 之前。
         */
        async moveConversation(sourceKey: string, targetKey: string) {
            if (sourceKey === targetKey) return;

            const fromIndex = this.conversationsItems.findIndex(
                (it) => it.key === sourceKey,
            );
            const toIndex = this.conversationsItems.findIndex(
                (it) => it.key === targetKey,
            );
            if (fromIndex < 0 || toIndex < 0) return;

            const next = [...this.conversationsItems];
            const [moved] = next.splice(fromIndex, 1);
            const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
            next.splice(insertIndex, 0, moved);
            this.conversationsItems = next;

            this.hasPendingChanges = true;
            this.indexDirty = true;
            await this.persistPending(true);
        },

        async saveConversations() {
            // 兼容旧调用点：实际改为保存索引 + 待保存会话分片
            await this.persistPending(true);
        },

        // 标记有待保存的更改
        markPendingChanges(conversationId?: string) {
            this.hasPendingChanges = true;
            this.indexDirty = true;
            const id = conversationId || this.activeKey;
            if (id) {
                this.pendingConversationIds = {
                    ...this.pendingConversationIds,
                    [id]: true,
                };
            }
        },

        async persistPending(immediate = false) {
            try {
                if (!this.hasPendingChanges && !this.indexDirty) return;

                const entries: Array<{
                    key: string;
                    value: any;
                    encrypt?: boolean;
                }> = [];

                // 索引（小对象）
                if (this.indexDirty) {
                    entries.push({
                        key: this.chatIndexKey(),
                        value: {
                            version: 2,
                            items: this.conversationsItems,
                            order: this.conversationsItems.map((it) => it.key),
                        },
                    });
                }

                // 会话分片（仅保存脏的会话）
                for (const [id, dirty] of Object.entries(
                    this.pendingConversationIds,
                )) {
                    if (!dirty) continue;
                    const conv = this.conversations[id];
                    if (!conv) continue;
                    if (!this.loadedConversationIds[id]) continue;
                    entries.push({
                        key: this.chatConversationKey(id),
                        value: conv,
                    });
                }

                if (entries.length === 0) {
                    this.hasPendingChanges = false;
                    this.indexDirty = false;
                    this.pendingConversationIds = {};
                    return;
                }

                await storeUtils.setMany(entries);

                this.hasPendingChanges = false;
                this.indexDirty = false;
                this.pendingConversationIds = {};
            } catch (error) {
                console.error("保存会话失败:", error);
                if (immediate) throw error;
            }
        },

        // 防抖保存（延迟保存，避免频繁写入）
        debouncedSave(immediate = false) {
            if (this.saveTimer) {
                clearTimeout(this.saveTimer);
            }

            if (immediate) {
                void this.persistPending(true);
            } else {
                this.saveTimer = setTimeout(() => {
                    void this.persistPending();
                }, 1000); // 1秒后保存
            }
        },

        // 立即保存（用于会话完成时）
        async saveImmediately() {
            if (this.saveTimer) {
                clearTimeout(this.saveTimer);
                this.saveTimer = null;
            }
            await this.persistPending(true);
        },

        async createNewConversation(activate = true) {
            const emptyKey = this.findEmptyConversation();
            if (emptyKey) {
                if (activate) {
                    await this.selectConversation(emptyKey);
                }
                return emptyKey;
            }
            // 创建新的
            const id = `conv_${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 9)}`;
            const now = Date.now();

            const newConversation: Conversation = {
                id,
                title: "新对话",
                messages: [],
                createdAt: now,
                updatedAt: now,
                modelId: this.selectedModel?.id,
            };

            this.conversations[id] = newConversation;
            this.loadedConversationIds[id] = true;
            this.conversationsItems.unshift({
                key: id,
                label: newConversation.title,
                timestamp: now,
                messageCount: 0,
            });

            if (activate) {
                this.activeKey = id;
            }
            this.indexDirty = true;
            this.pendingConversationIds = {
                ...this.pendingConversationIds,
                [id]: true,
            };
            this.hasPendingChanges = true;
            await this.persistPending(true);

            return id;
        },

        async deleteConversation(id: string) {
            try {
                delete this.conversations[id];
                delete this.loadedConversationIds[id];
                this.conversationsItems = this.conversationsItems.filter(
                    (item) => item.key !== id,
                );

                this.indexDirty = true;

                // 如果删除的是当前会话，切换到第一个
                if (this.activeKey === id) {
                    if (this.conversationsItems.length > 0) {
                        await this.selectConversation(
                            this.conversationsItems[0].key,
                        );
                    } else {
                        await this.createNewConversation();
                    }
                }

                await storeUtils.delete(this.chatConversationKey(id));
                this.markPendingChanges();
                await this.persistPending(true);
            } catch (error) {
                console.error("删除会话失败:", error);
            }
        },

        async renameConversation(id: string, newTitle: string) {
            try {
                if (this.loadedConversationIds[id] && this.conversations[id]) {
                    this.conversations[id].title = newTitle;
                    this.pendingConversationIds = {
                        ...this.pendingConversationIds,
                        [id]: true,
                    };
                    this.hasPendingChanges = true;
                }

                const item = this.conversationsItems.find(
                    (item) => item.key === id,
                );
                if (item) {
                    item.label = newTitle;
                }

                this.indexDirty = true;
                this.hasPendingChanges = true;

                await this.persistPending(true);
            } catch (error) {
                console.error("重命名会话失败:", error);
            }
        },

        // 自动生成会话标题（基于第一条用户消息）
        async autoGenerateTitle(conversationId: string) {
            const conversation = this.conversations[conversationId];
            if (!conversation) return;

            // 如果已经有自定义标题，不自动生成
            if (
                conversation.title !== "新对话" &&
                !conversation.title.startsWith("新对话 ")
            ) {
                return;
            }

            // 找到第一条用户消息
            const firstUserMsg = conversation.messages.find(
                (msg) => msg.role === "user",
            );
            if (firstUserMsg) {
                // 截取前30个字符作为标题
                let title = firstUserMsg.content.trim().substring(0, 30);
                if (firstUserMsg.content.length > 30) {
                    title += "...";
                }

                await this.renameConversation(conversationId, title);
            }
        },

        // 生成基于对话内容的总结标题
        async generateSummaryTitle(conversationId: string) {
            const conversation = this.conversations[conversationId];
            if (!conversation) return;

            // 如果已经有自定义标题，不生成总结
            if (
                conversation.title !== "新对话" &&
                !conversation.title.startsWith("新对话 ")
            ) {
                return;
            }

            // 需要至少有一轮对话（用户消息 + AI回复）
            const userMessages = conversation.messages.filter(
                (m) => m.role === "user",
            );
            const assistantMessages = conversation.messages.filter(
                (m) => m.role === "assistant",
            );
            if (userMessages.length < 1 || assistantMessages.length < 1) {
                return;
            }

            try {
                // 构建对话内容用于总结
                const conversationText = conversation.messages
                    .filter((m) => m.role !== "system")
                    .map(
                        (m) =>
                            `${m.role === "user" ? "用户" : "AI"}: ${m.content}`,
                    )
                    .join("\n");

                // 使用AI生成总结
                const summaryPrompt = `请为以下对话生成一个简短的标题（不超过20个字符）：\n\n${conversationText}\n\n标题：`;

                const host =
                    import.meta.env.VITE_API_HOST || "http://localhost:3000";

                const openai = new OpenAI({
                    apiKey: "123456",
                    baseURL: `${host}/api/v1`,
                    dangerouslyAllowBrowser: true,
                });

                const response = await openai.chat.completions.create({
                    model: "xai/grok-4.1-fast-non-reasoning",
                    messages: [{ role: "user", content: summaryPrompt }],
                    temperature: 0.7,
                    stream: false,
                });

                // 处理OpenAI响应
                const summary = response.choices[0]?.message?.content || "";
                console.log("Summary API response:", summary); // 调试日志

                // 清理总结文本
                let cleanedSummary = summary.trim();
                if (cleanedSummary.length > 20) {
                    cleanedSummary = cleanedSummary.substring(0, 20) + "...";
                }

                if (cleanedSummary) {
                    await this.renameConversation(
                        conversationId,
                        cleanedSummary,
                    );
                }
            } catch (error) {
                console.error("生成总结标题失败:", error);
                // 回退到基于第一条用户消息的标题
                await this.autoGenerateTitle(conversationId);
            }
        },

        // ============ 消息管理 ============
        async addMessage(
            conversationId: string,
            msgData: Omit<StoredChatMessage, "id" | "timestamp">,
            saveImmediately = false,
        ) {
            try {
                const conversation = this.conversations[conversationId];
                if (!conversation) return;

                const newMessage: StoredChatMessage = {
                    ...msgData,
                    id: `msg_${Date.now()}_${Math.random()
                        .toString(36)
                        .substr(2, 9)}`,
                    timestamp: Date.now(),
                };

                conversation.messages.push(newMessage);
                conversation.updatedAt = newMessage.timestamp;

                const item = this.conversationsItems.find(
                    (it) => it.key === conversationId,
                );
                if (item) {
                    item.timestamp = newMessage.timestamp;
                    item.messageCount = conversation.messages.length;
                }

                // 如果是第一条用户消息，自动生成标题并立即保存
                if (
                    msgData.role === "user" &&
                    conversation.messages.filter((m) => m.role === "user")
                        .length === 1
                ) {
                    await this.autoGenerateTitle(conversationId);
                } else {
                    // 标记有待保存的更改
                    this.markPendingChanges(conversationId);
                    // 如果需要立即保存（比如用户消息），则立即保存，否则防抖保存
                    if (saveImmediately) {
                        this.debouncedSave(true);
                    }
                }

                return newMessage;
            } catch (error) {
                console.error("添加消息失败:", error);
            }
        },

        async updateMessage(
            conversationId: string,
            messageId: string,
            updates: Partial<StoredChatMessage>,
            saveImmediately = false,
        ) {
            try {
                const conversation = this.conversations[conversationId];
                if (!conversation) return;

                const msg = conversation.messages.find(
                    (m) => m.id === messageId,
                );
                if (msg) {
                    Object.assign(msg, updates);
                    const last =
                        conversation.messages.length > 0
                            ? conversation.messages[
                                  conversation.messages.length - 1
                              ].timestamp
                            : Date.now();
                    conversation.updatedAt = last;

                    const item = this.conversationsItems.find(
                        (it) => it.key === conversationId,
                    );
                    if (item) {
                        item.timestamp = last;
                        item.messageCount = conversation.messages.length;
                    }

                    // 标记有待保存的更改
                    this.markPendingChanges(conversationId);
                    // 根据需要决定是否立即保存
                    if (saveImmediately) {
                        this.debouncedSave(true);
                    }
                }
            } catch (error) {
                console.error("更新消息失败:", error);
            }
        },

        // ============ UI 交互 ============
        findEmptyConversation(): string | null {
            // 使用索引元数据判断，避免扫描/加载全量会话
            for (const item of this.conversationsItems) {
                if (item.messageCount === 0) return item.key;
            }
            return null;
        },

        async onAddConversation() {
            const newId = await this.createNewConversation();
            this.activeKey = newId;
        },

        onConversationClick(key: string) {
            void this.selectConversation(key);
        },

        handleFileChange(files: AttachmentFile[]) {
            this.attachedFiles = files;
        },

        // ============ 模型管理 ============
        async loadAvailableModels() {
            this.isLoadingModels = true;
            this.modelsError = null;
            try {
                // Glosc 模型 + 用户自定义模型（本地加密存储的第三方 Key 配置）
                const gloscModels = await fetchAvailableModels();
                const settingsStore = useSettingsStore();
                // 兜底：确保 settings 初始化（main.ts 会先 init，但这里避免时序问题）
                await settingsStore.init();
                const customModels = settingsStore.getCustomSelectableModels();
                this.availableModels = [...gloscModels, ...customModels];

                if (this.availableModels.length > 0) {
                    const persistedModelId =
                        await this.loadPersistedSelectedModelId();

                    const currentModelId = this.selectedModel?.id;
                    const desiredModelId = currentModelId || persistedModelId;

                    const defaultModelId = "xai/grok-code-fast-1";

                    const resolvedModel = desiredModelId
                        ? this.availableModels.find(
                              (m) => m.id === desiredModelId,
                          )
                        : undefined;

                    const fallbackDefaultModel = this.availableModels.find(
                        (m) => m.id === defaultModelId,
                    );

                    const nextModel =
                        resolvedModel ||
                        fallbackDefaultModel ||
                        this.availableModels[0];

                    if (this.selectedModel?.id !== nextModel?.id) {
                        this.selectedModel = nextModel;
                    }

                    await this.persistSelectedModelId(
                        this.selectedModel?.id || null,
                    );
                }
            } catch (error) {
                this.modelsError =
                    error instanceof Error ? error.message : "加载模型失败";
                console.error("Failed to load models:", error);
            } finally {
                this.isLoadingModels = false;
            }
        },

        selectModel(model: ModelInfo | null) {
            this.selectedModel = model;
            void this.persistSelectedModelId(model?.id || null);
            this.markModelUsed(model?.id);
        },
    },
});
