import { defineStore } from "pinia";

import { fetchAvailableModels } from "../utils/ModelApi";
import { storeUtils } from "../utils/StoreUtils";
import type { AttachmentFile } from "@/components/ai-elements/prompt-input";

export const useChatStore = defineStore("chat", {
    state: () => ({
        headerOpen: false,
        settingsOpen: false,
        content: "",
        // 会话相关
        conversations: {} as Record<string, Conversation>,
        conversationsItems: [] as ConversationItem[],
        activeKey: "",
        attachedFiles: [] as AttachmentFile[],
        // 模型相关
        availableModels: [] as ModelInfo[],
        selectedModel: null as ModelInfo | null,
        isLoadingModels: false,
        modelsError: null as string | null,
        // 初始化状态
        isInitialized: false,
        // 存储优化
        hasPendingChanges: false,
        saveTimer: null as any,
    }),
    getters: {},
    actions: {
        // ============ 初始化 ============
        async init() {
            if (this.isInitialized) return;

            try {
                // 加载会话数据
                await this.loadConversations();

                // 如果没有会话，创建默认会话
                if (this.conversationsItems.length === 0) {
                    await this.createNewConversation();
                } else {
                    // 选中第一个会话
                    this.activeKey = this.conversationsItems[0].key;
                }

                this.isInitialized = true;
            } catch (error) {
                console.error("初始化失败:", error);
            }
        },

        // ============ 会话管理 ============
        async loadConversations() {
            try {
                const data = await storeUtils.get<{
                    conversations: Record<string, Conversation>;
                    conversationsOrder: string[];
                }>("chat_data");

                if (data) {
                    this.conversations = data.conversations || {};

                    // 构建会话列表
                    const order =
                        data.conversationsOrder ||
                        Object.keys(this.conversations);
                    this.conversationsItems = order
                        .filter((id) => this.conversations[id])
                        .map((id) => ({
                            key: id,
                            label: this.conversations[id].title,
                            timestamp: this.conversations[id].updatedAt,
                        }))
                        .sort(
                            (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
                        );
                }
            } catch (error) {
                console.error("加载会话失败:", error);
            }
        },

        async saveConversations() {
            try {
                const order = this.conversationsItems.map((item) => item.key);
                await storeUtils.set("chat_data", {
                    conversations: this.conversations,
                    conversationsOrder: order,
                });
                this.hasPendingChanges = false;
            } catch (error) {
                console.error("保存会话失败:", error);
            }
        },

        // 标记有待保存的更改
        markPendingChanges() {
            this.hasPendingChanges = true;
        },

        // 防抖保存（延迟保存，避免频繁写入）
        debouncedSave(immediate = false) {
            if (this.saveTimer) {
                clearTimeout(this.saveTimer);
            }

            if (immediate) {
                this.saveConversations();
            } else {
                this.saveTimer = setTimeout(() => {
                    if (this.hasPendingChanges) {
                        this.saveConversations();
                    }
                }, 1000); // 1秒后保存
            }
        },

        // 立即保存（用于会话完成时）
        async saveImmediately() {
            if (this.saveTimer) {
                clearTimeout(this.saveTimer);
                this.saveTimer = null;
            }
            if (this.hasPendingChanges) {
                await this.saveConversations();
            }
        },

        async createNewConversation() {
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
            this.conversationsItems.unshift({
                key: id,
                label: newConversation.title,
                timestamp: now,
            });

            this.activeKey = id;
            await this.saveConversations();

            return id;
        },

        async deleteConversation(id: string) {
            try {
                delete this.conversations[id];
                this.conversationsItems = this.conversationsItems.filter(
                    (item) => item.key !== id
                );

                // 如果删除的是当前会话，切换到第一个
                if (this.activeKey === id) {
                    if (this.conversationsItems.length > 0) {
                        this.activeKey = this.conversationsItems[0].key;
                    } else {
                        await this.createNewConversation();
                    }
                }

                await this.saveConversations();
            } catch (error) {
                console.error("删除会话失败:", error);
            }
        },

        async renameConversation(id: string, newTitle: string) {
            try {
                if (this.conversations[id]) {
                    this.conversations[id].title = newTitle;
                    this.conversations[id].updatedAt = Date.now();

                    const item = this.conversationsItems.find(
                        (item) => item.key === id
                    );
                    if (item) {
                        item.label = newTitle;
                    }

                    await this.saveConversations();
                }
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
                (msg) => msg.role === "user"
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

        // ============ 消息管理 ============
        async addMessage(
            conversationId: string,
            msgData: Omit<StoredChatMessage, "id" | "timestamp">,
            saveImmediately = false
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
                conversation.updatedAt = Date.now();

                // 如果是第一条用户消息，自动生成标题并立即保存
                if (
                    msgData.role === "user" &&
                    conversation.messages.filter((m) => m.role === "user")
                        .length === 1
                ) {
                    await this.autoGenerateTitle(conversationId);
                } else {
                    // 标记有待保存的更改
                    this.markPendingChanges();
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
            saveImmediately = false
        ) {
            try {
                const conversation = this.conversations[conversationId];
                if (!conversation) return;

                const msg = conversation.messages.find(
                    (m) => m.id === messageId
                );
                if (msg) {
                    Object.assign(msg, updates);
                    conversation.updatedAt = Date.now();

                    // 标记有待保存的更改
                    this.markPendingChanges();
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
        onAddConversation() {
            this.createNewConversation();
        },

        onConversationClick(key: string) {
            this.activeKey = key;
        },

        handleFileChange(files: AttachmentFile[]) {
            this.attachedFiles = files;
        },

        // ============ 模型管理 ============
        async loadAvailableModels() {
            this.isLoadingModels = true;
            this.modelsError = null;
            try {
                this.availableModels = await fetchAvailableModels();
                // 如果还没有选中模型，选择第一个
                if (!this.selectedModel && this.availableModels.length > 0) {
                    this.selectedModel = this.availableModels[0];
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
        },
    },
});
