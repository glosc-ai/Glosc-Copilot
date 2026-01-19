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
<<<<<<< HEAD
        // 按日期分组的会议列表（逻辑对齐 chatStore.groupedConversations）
        groupedMeetings: (state) => {
            const groups: Record<string, MeetingItem[]> = {};
            const now = new Date();
            const today = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
            );
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            state.meetingsItems.forEach((item) => {
                const date = new Date(item.timestamp || 0);
                let dateKey: string;

                if (date >= today) {
                    dateKey = "今天";
                } else if (date >= yesterday) {
                    dateKey = "昨天";
                } else {
                    dateKey = date.toISOString().split("T")[0];
                }

                if (!groups[dateKey]) {
                    groups[dateKey] = [];
                }
                groups[dateKey].push(item);
            });

            const sortedGroups: Record<string, MeetingItem[]> = {};
            const keys = Object.keys(groups).sort((a, b) => {
                if (a === "今天") return -1;
                if (b === "今天") return 1;
                if (a === "昨天") return -1;
                if (b === "昨天") return 1;
                return b.localeCompare(a);
            });

            keys.forEach((key) => {
                sortedGroups[key] = groups[key].sort((a, b) => {
                    return (b.timestamp || 0) - (a.timestamp || 0);
                });
            });

            return sortedGroups;
        },

=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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

<<<<<<< HEAD
                if (
                    index &&
                    index.version === 1 &&
                    Array.isArray(index.items)
                ) {
=======
                if (index && index.version === 1 && Array.isArray(index.items)) {
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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
<<<<<<< HEAD
                const meeting = await storeUtils.get<Meeting>(
                    this.meetingKey(id),
                );
=======
                const meeting = await storeUtils.get<Meeting>(this.meetingKey(id));
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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
<<<<<<< HEAD
                autoCycle: false,
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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
<<<<<<< HEAD
                autoCycle: false,
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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
<<<<<<< HEAD
                    await storeUtils.set(
                        this.meetingKey(id),
                        this.meetings[id],
                        true,
                    );
=======
                    await storeUtils.set(this.meetingKey(id), this.meetings[id], true);
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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

<<<<<<< HEAD
        /**
         * 拖拽排序：把 sourceKey 移动到 targetKey 之前。
         */
        async moveMeeting(sourceKey: string, targetKey: string) {
            if (sourceKey === targetKey) return;

            const fromIndex = this.meetingsItems.findIndex(
                (it) => it.key === sourceKey,
            );
            const toIndex = this.meetingsItems.findIndex(
                (it) => it.key === targetKey,
            );
            if (fromIndex < 0 || toIndex < 0) return;

            const next = [...this.meetingsItems];
            const [moved] = next.splice(fromIndex, 1);
            const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
            next.splice(insertIndex, 0, moved);
            this.meetingsItems = next;

            await this.persistIndex();
        },

=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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
<<<<<<< HEAD
        async addMessage(
            meetingId: string,
            message: Omit<MeetingMessage, "id" | "timestamp">,
            options?: {
                /**
                 * 是否立即落盘。默认 true。
                 * 流式生成时可传 false，结束后再统一保存。
                 */
                persist?: boolean;
            },
        ) {
=======
        async addMessage(meetingId: string, message: Omit<MeetingMessage, "id" | "timestamp">) {
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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

<<<<<<< HEAD
            const persist = options?.persist ?? true;
            if (persist) {
                await storeUtils.set(this.meetingKey(meetingId), meeting, true);
                await this.persistIndex();
            }
=======
            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
            await this.persistIndex();
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)

            return newMessage.id;
        },

        async updateMessage(
            meetingId: string,
            messageId: string,
            updates: Partial<MeetingMessage>,
<<<<<<< HEAD
            options?: {
                /**
                 * 是否立即落盘。默认 true。
                 * 流式生成时可传 false，结束后再统一保存。
                 */
                persist?: boolean;
            },
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
        ) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            const msg = meeting.messages.find((m) => m.id === messageId);
            if (!msg) return;

            Object.assign(msg, updates);
            meeting.updatedAt = Date.now();

<<<<<<< HEAD
            const persist = options?.persist ?? true;
            if (persist) {
                await storeUtils.set(this.meetingKey(meetingId), meeting, true);
            }
=======
            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
        },

        async deleteMessage(meetingId: string, messageId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

<<<<<<< HEAD
            meeting.messages = meeting.messages.filter(
                (m) => m.id !== messageId,
            );
=======
            meeting.messages = meeting.messages.filter((m) => m.id !== messageId);
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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

<<<<<<< HEAD
        async addToQueue(
            meetingId: string,
            node: Omit<QueueNode, "id">,
            position?: number,
        ) {
=======
        async addToQueue(meetingId: string, node: Omit<QueueNode, "id">, position?: number) {
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            if (!meeting.speakerQueue) meeting.speakerQueue = [];

            const newNode: QueueNode = {
                ...node,
                id: crypto.randomUUID(),
            };

<<<<<<< HEAD
            if (
                position !== undefined &&
                position >= 0 &&
                position < meeting.speakerQueue.length
            ) {
=======
            if (position !== undefined && position >= 0 && position <= meeting.speakerQueue.length) {
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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

<<<<<<< HEAD
            meeting.speakerQueue = meeting.speakerQueue.filter(
                (n) => n.id !== nodeId,
            );
=======
            meeting.speakerQueue = meeting.speakerQueue.filter((n) => n.id !== nodeId);
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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

<<<<<<< HEAD
        async startMeetingFromCurrent(meetingId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.status = "running";
            // 不重置 currentSpeakerIndex；若不存在则从 0 开始
            if (meeting.currentSpeakerIndex === undefined) {
                meeting.currentSpeakerIndex = 0;
            }
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async setCurrentSpeakerIndex(meetingId: string, index: number) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            const queueLen = meeting.speakerQueue?.length ?? 0;
            const nextIndex = Math.max(
                0,
                Math.min(index, Math.max(0, queueLen)),
            );
            meeting.currentSpeakerIndex = nextIndex;
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async jumpToRoleInQueue(meetingId: string, roleId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            const queue = meeting.speakerQueue ?? [];
            const idx = queue.findIndex(
                (n) => n.type === "role" && n.roleId === roleId,
            );
            if (idx < 0) return;

            meeting.currentSpeakerIndex = idx;
            meeting.updatedAt = Date.now();
            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async setAutoCycle(meetingId: string, enabled: boolean) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.autoCycle = enabled;
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

        async toggleAutoCycle(meetingId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return;

            meeting.autoCycle = !meeting.autoCycle;
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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
<<<<<<< HEAD
                // 确保不超出队列范围
                if (
                    meeting.speakerQueue &&
                    meeting.currentSpeakerIndex >= meeting.speakerQueue.length
                ) {
                    meeting.currentSpeakerIndex = meeting.speakerQueue.length;
                }
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
            }
            meeting.updatedAt = Date.now();

            await storeUtils.set(this.meetingKey(meetingId), meeting, true);
        },

<<<<<<< HEAD
        // ============ 导出 ============
        async exportMeetingMarkdown(meetingId: string) {
            await this.ensureMeetingLoaded(meetingId);
            const meeting = this.meetings[meetingId];
            if (!meeting) return "";

            const formatTime = (ts?: number) => {
                if (!ts) return "";
                const d = new Date(ts);
                const pad2 = (n: number) => String(n).padStart(2, "0");
                return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
            };

            const safe = (s: any) => (typeof s === "string" ? s : "");
            const title = safe(meeting.title) || "会议";

            const lines: string[] = [];
            lines.push(`# ${title}`);
            lines.push("");
            lines.push(`- 会议ID：${meeting.id}`);
            lines.push(`- 创建时间：${formatTime(meeting.createdAt)}`);
            lines.push(`- 更新时间：${formatTime(meeting.updatedAt)}`);
            lines.push("");

            const summary = safe(meeting.summary).trim();
            if (summary) {
                lines.push("## 会议背景");
                lines.push("");
                lines.push(summary);
                lines.push("");
            }

            lines.push("## 参与角色");
            lines.push("");
            if ((meeting.roles || []).length === 0) {
                lines.push("（无）");
                lines.push("");
            } else {
                lines.push("| 角色 | 模型 | 备注 |");
                lines.push("| --- | --- | --- |");
                for (const r of meeting.roles) {
                    const name = safe(r.name) || r.id;
                    const model = safe(r.modelId) || "";
                    const note = safe(r.systemPrompt)
                        .replace(/\r\n/g, "\n")
                        .replace(/\n/g, " ")
                        .slice(0, 120);
                    lines.push(`| ${name} | ${model} | ${note} |`);
                }
                lines.push("");
            }

            lines.push("## 对话记录");
            lines.push("");
            const msgs = meeting.messages || [];
            if (msgs.length === 0) {
                lines.push("（无）");
                lines.push("");
            } else {
                for (const m of msgs) {
                    const speaker =
                        safe(m.speakerName) || safe(m.speakerId) || m.role;
                    const ts = formatTime(m.timestamp);
                    const header = ts
                        ? `### ${speaker} · ${ts}`
                        : `### ${speaker}`;
                    lines.push(header);
                    lines.push("");
                    const content = safe(m.content).replace(/\r\n/g, "\n");
                    lines.push(content || "（空）");

                    const reasoning = safe((m as any).reasoning).trim();
                    if (reasoning) {
                        lines.push("");
                        lines.push("<details><summary>推理过程</summary>");
                        lines.push("");
                        lines.push("```\n" + reasoning + "\n```");
                        lines.push("");
                        lines.push("</details>");
                    }

                    lines.push("");
                }
            }

            return lines.join("\n");
        },

=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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

<<<<<<< HEAD
            const usedColors = new Set(
                meeting.roles.map((r) => r.color).filter(Boolean),
            );
            const availableColor = DEFAULT_COLORS.find(
                (c) => !usedColors.has(c),
            );
            return (
                availableColor ||
                DEFAULT_COLORS[meeting.roles.length % DEFAULT_COLORS.length]
            );
=======
            const usedColors = new Set(meeting.roles.map((r) => r.color).filter(Boolean));
            const availableColor = DEFAULT_COLORS.find((c) => !usedColors.has(c));
            return availableColor || DEFAULT_COLORS[meeting.roles.length % DEFAULT_COLORS.length];
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
        },

        getNextAvailableAvatar(meetingId: string): string {
            const meeting = this.meetings[meetingId];
            if (!meeting) return DEFAULT_AVATARS[0];

<<<<<<< HEAD
            const usedAvatars = new Set(
                meeting.roles.map((r) => r.avatar).filter(Boolean),
            );
            const availableAvatar = DEFAULT_AVATARS.find(
                (a) => !usedAvatars.has(a),
            );
            return (
                availableAvatar ||
                DEFAULT_AVATARS[meeting.roles.length % DEFAULT_AVATARS.length]
            );
=======
            const usedAvatars = new Set(meeting.roles.map((r) => r.avatar).filter(Boolean));
            const availableAvatar = DEFAULT_AVATARS.find((a) => !usedAvatars.has(a));
            return availableAvatar || DEFAULT_AVATARS[meeting.roles.length % DEFAULT_AVATARS.length];
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
        },
    },
});
