import { defineStore } from "pinia";
import { storeUtils } from "@/utils/StoreUtils";
import type {
    Meeting,
    MeetingItem,
    MeetingRole,
    MeetingMessage,
    QueueNode,
    MeetingStatus,
} from "@/utils/meetingInterface";
import { DEFAULT_AVATARS, DEFAULT_COLORS } from "@/utils/meetingInterface";
import { fetchAvailableModels } from "@/utils/ModelApi";
import type { ModelInfo } from "@/utils/interface";

export const useMeetingStore = defineStore("meeting", {
    state: () => ({
        // 会议列表
        meetingsItems: [] as MeetingItem[],
        meetings: {} as Record<string, Meeting>,
        loadedMeetingIds: {} as Record<string, boolean>,
        activeKey: "",

        // 模型列表
        availableModels: [] as ModelInfo[],
        isLoadingModels: false,
        modelsError: null as string | null,

        // 初始化状态
        isInitialized: false,

        // 当前会议状态
        isGenerating: false, // 是否正在生成
        generatingMessageId: null as string | null, // 正在生成的消息ID
    }),

    getters: {
        // 当前激活的会议
        activeMeeting(state): Meeting | null {
            if (!state.activeKey) return null;
            return state.meetings[state.activeKey] || null;
        },

        // 当前会议的角色列表
        currentRoles(state): MeetingRole[] {
            const meeting = state.meetings[state.activeKey];
            return meeting?.roles || [];
        },

        // 当前会议的消息列表
        currentMessages(state): MeetingMessage[] {
            const meeting = state.meetings[state.activeKey];
            return meeting?.messages || [];
        },

        // 当前会议的发言队列
        currentQueue(state): QueueNode[] {
            const meeting = state.meetings[state.activeKey];
            return meeting?.speakerQueue || [];
        },

        // 当前会议状态
        currentStatus(state): MeetingStatus {
            const meeting = state.meetings[state.activeKey];
            return meeting?.status || "idle";
        },
    },

    actions: {
        // ============ 存储键 ============
        meetingIndexKey() {
            return "meeting_index_v1";
        },
        meetingKey(id: string) {
            return `meeting_v1:${id}`;
        },

        // ============ 初始化 ============
        async init() {
            if (this.isInitialized) return;

            try {
                await this.loadMeetings();
                await this.loadAvailableModels();
                this.isInitialized = true;
            } catch (error) {
                console.error("初始化会议 store 失败:", error);
            }
        },

        // ============ 会议管理 ============
        async loadMeetings() {
            try {
                const index = await storeUtils.get<{
                    version: number;
                    items: MeetingItem[];
                    order?: string[];
                }>(this.meetingIndexKey());

                if (index && index.version === 1 && Array.isArray(index.items)) {
                    const order =
                        Array.isArray(index.order) && index.order.length > 0
                            ? index.order
                            : index.items.map((it) => it.key);
                    const map = new Map(index.items.map((it) => [it.key, it]));
                    this.meetingsItems = order
                        .map((id) => map.get(id))
                        .filter(Boolean) as MeetingItem[];

                    this.meetings = {};
                    this.loadedMeetingIds = {};
                    return;
                }

                // 全新：没有任何数据
                this.meetings = {};
                this.loadedMeetingIds = {};
                this.meetingsItems = [];
            } catch (error) {
                console.error("加载会议列表失败:", error);
            }
        },

        async persistIndex() {
            try {
                const order = this.meetingsItems.map((it) => it.key);
                await storeUtils.set(
                    this.meetingIndexKey(),
                    { version: 1, items: this.meetingsItems, order },
                    true,
                );
            } catch (error) {
                console.error("保存会议索引失败:", error);
            }
        },

        async ensureMeetingLoaded(id: string) {
            if (!id) return;
            if (this.loadedMeetingIds[id] && this.meetings[id]) return;

            try {
                const meeting = await storeUtils.get<Meeting>(this.meetingKey(id));
                if (meeting) {
                    this.meetings[id] = meeting;
                    this.loadedMeetingIds[id] = true;
                    return;
                }
            } catch (error) {
                console.warn("加载会议内容失败:", id, error);
            }

            // 找不到时，创建一个最小占位
            const item = this.meetingsItems.find((it) => it.key === id);
            const now = Date.now();
            this.meetings[id] = {
                id,
                title: item?.label || "新会议",
                summary: item?.summary || "",
                createdAt: item?.timestamp || now,
                updatedAt: item?.timestamp || now,
                roles: [],
                messages: [],
                status: "idle",
                speakerQueue: [],
                autoAdvance: true,
            };
            this.loadedMeetingIds[id] = true;
        },

        async createMeeting() {
            const id = crypto.randomUUID();
            const now = Date.now();

            const newMeeting: Meeting = {
                id,
                title: "新会议",
                summary: "请描述本次会议的主题和背景...",
                createdAt: now,
                updatedAt: now,
                roles: [],
                messages: [],
                status: "idle",
                speakerQueue: [],
                autoAdvance: true,
            };

            const item: MeetingItem = {
                key: id,
                label: newMeeting.title,
                summary: newMeeting.summary,
                timestamp: now,
                roleCount: 0,
                messageCount: 0,
            };

            this.meetings[id] = newMeeting;
            this.loadedMeetingIds[id] = true;
            this.meetingsItems.unshift(item);

            await storeUtils.set(this.meetingKey(id), newMeeting, true);
            await this.persistIndex();

            return id;
        },

        async selectMeeting(id: string) {
            if (!id) {
                this.activeKey = "";
                return;
            }
            await this.ensureMeetingLoaded(id);
            this.activeKey = id;
        },

        async renameMeeting(id: string, newTitle: string) {
            try {
                if (this.loadedMeetingIds[id] && this.meetings[id]) {
                    this.meetings[id].title = newTitle;
                    this.meetings[id].updatedAt = Date.now();
                    await storeUtils.set(this.meetingKey(id), this.meetings[id], true);
                }

                const item = this.meetingsItems.find((item) => item.key === id);
                if (item) {
                    item.label = newTitle;
                }

                await this.persistIndex();
            } catch (error) {
                console.error("重命名会议失败:", error);
            }
        },

        async updateMeetingSummary(id: string, summary: string) {
            try {
                await this.ensureMeetingLoaded(id);
                const meeting = this.meetings[id];
                if (!meeting) return;

                meeting.summary = summary;
                meeting.updatedAt = Date.now();

                const item = this.meetingsItems.find((it) => it.key === id);
                if (item) {
                    item.summary = summary;
                }

                await storeUtils.set(this.meetingKey(id), meeting, true);
                await this.persistIndex();
            } catch (error) {
                console.error("更新会议摘要失败:", error);
            }
        },

        async deleteMeeting(id: string) {
            try {
                delete this.meetings[id];
                delete this.loadedMeetingIds[id];
                this.meetingsItems = this.meetingsItems.filter(
                    (item) => item.key !== id,
                );

                if (this.activeKey === id) {
                    this.activeKey = this.meetingsItems[0]?.key || "";
                }

                await storeUtils.delete(this.meetingKey(id));
                await this.persistIndex();
            } catch (error) {
                console.error("删除会议失败:", error);
            }
        },

        // ============ 角色管理 ============
        async addRole(meetingId: string, role: Omit<MeetingRole, "id">) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            const newRole: MeetingRole = {
                ...role,
                id: crypto.randomUUID(),
            };

            meeting.roles.push(newRole);
            meeting.updatedAt = Date.now();

            // 自动添加到队列末尾
            if (!meeting.speakerQueue) meeting.speakerQueue = [];
            meeting.speakerQueue.push({
                id: crypto.randomUUID(),
                type: "role",
                roleId: newRole.id,
            });

            const item = this.meetingsItems.find((it) => it.key === meetingId);
            if (item) {
                item.roleCount = meeting.roles.length;
            }

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
            await this.persistIndex();

            return newRole.id;
        },

        async updateRole(
            meetingId: string,
            roleId: string,
            updates: Partial<MeetingRole>,
        ) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            const role = meeting.roles.find((r) => r.id === roleId);
            if (!role) return;

            Object.assign(role, updates);
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async deleteRole(meetingId: string, roleId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.roles = meeting.roles.filter((r) => r.id !== roleId);
            // 从队列中移除
            if (meeting.speakerQueue) {
                meeting.speakerQueue = meeting.speakerQueue.filter(
                    (node) => node.roleId !== roleId,
                );
            }
            meeting.updatedAt = Date.now();

            const item = this.meetingsItems.find((it) => it.key === meetingId);
            if (item) {
                item.roleCount = meeting.roles.length;
            }

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
            await this.persistIndex();
        },

        // ============ 消息管理 ============
        async addMessage(meetingId: string, message: Omit<MeetingMessage, "id" | "timestamp">) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            const newMessage: MeetingMessage = {
                ...message,
                id: crypto.randomUUID(),
                timestamp: Date.now(),
            };

            meeting.messages.push(newMessage);
            meeting.updatedAt = newMessage.timestamp;

            const item = this.meetingsItems.find((it) => it.key === meetingId);
            if (item) {
                item.messageCount = meeting.messages.length;
                item.timestamp = newMessage.timestamp;
            }

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
            await this.persistIndex();

            return newMessage.id;
        },

        async updateMessage(
            meetingId: string,
            messageId: string,
            updates: Partial<MeetingMessage>,
        ) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            const msg = meeting.messages.find((m) => m.id === messageId);
            if (!msg) return;

            Object.assign(msg, updates);
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async deleteMessage(meetingId: string, messageId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.messages = meeting.messages.filter((m) => m.id !== messageId);
            meeting.updatedAt = Date.now();

            const item = this.meetingsItems.find((it) => it.key === meetingId);
            if (item) {
                item.messageCount = meeting.messages.length;
            }

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
            await this.persistIndex();
        },

        // ============ 队列管理 ============
        async updateQueue(meetingId: string, queue: QueueNode[]) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.speakerQueue = queue;
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async addToQueue(meetingId: string, node: Omit<QueueNode, "id">, position?: number) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            if (!meeting.speakerQueue) meeting.speakerQueue = [];

            const newNode: QueueNode = {
                ...node,
                id: crypto.randomUUID(),
            };

            if (position !== undefined && position >= 0 && position <= meeting.speakerQueue.length) {
                meeting.speakerQueue.splice(position, 0, newNode);
            } else {
                meeting.speakerQueue.push(newNode);
            }

            meeting.updatedAt = Date.now();
            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async removeFromQueue(meetingId: string, nodeId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            if (!meeting.speakerQueue) return;

            meeting.speakerQueue = meeting.speakerQueue.filter((n) => n.id !== nodeId);
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        // ============ 会议状态控制 ============
        async startMeeting(meetingId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.status = "running";
            meeting.currentSpeakerIndex = 0;
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async pauseMeeting(meetingId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.status = "paused";
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async resumeMeeting(meetingId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.status = "running";
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async stopMeeting(meetingId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.status = "stopped";
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async advanceQueue(meetingId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            if (meeting.currentSpeakerIndex !== undefined) {
                meeting.currentSpeakerIndex++;
            }
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        // ============ 模型管理 ============
        async loadAvailableModels() {
            this.isLoadingModels = true;
            this.modelsError = null;
            try {
                this.availableModels = await fetchAvailableModels();
            } catch (error) {
                this.modelsError =
                    error instanceof Error ? error.message : "加载模型失败";
                console.error("Failed to load models:", error);
            } finally {
                this.isLoadingModels = false;
            }
        },

        // ============ 辅助方法 ============
        getNextAvailableColor(meetingId: string): string {
            const meeting = this.meetings[meetingId];
            if (!meeting) return DEFAULT_COLORS[0];

            const usedColors = new Set(meeting.roles.map((r) => r.color).filter(Boolean));
            const availableColor = DEFAULT_COLORS.find((c) => !usedColors.has(c));
            return availableColor || DEFAULT_COLORS[meeting.roles.length % DEFAULT_COLORS.length];
        },

        getNextAvailableAvatar(meetingId: string): string {
            const meeting = this.meetings[meetingId];
            if (!meeting) return DEFAULT_AVATARS[0];

            const usedAvatars = new Set(meeting.roles.map((r) => r.avatar).filter(Boolean));
            const availableAvatar = DEFAULT_AVATARS.find((a) => !usedAvatars.has(a));
            return availableAvatar || DEFAULT_AVATARS[meeting.roles.length % DEFAULT_AVATARS.length];
        },
    },
});
