<script setup lang="ts">
<<<<<<< HEAD
<<<<<<< HEAD
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import {
    Play,
    Pause,
    StopCircle,
    Send,
    Repeat,
    FileText,
    Download,
} from "lucide-vue-next";
=======
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
=======
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
>>>>>>> 4afc7a7 (Add missing UI components and fix TypeScript errors)
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { Play, Pause, StopCircle, Send } from "lucide-vue-next";
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
import MeetingChat from "./MeetingChat.vue";
import SpeakerQueue from "./SpeakerQueue.vue";
import RoleList from "./RoleList.vue";
import { Textarea } from "@/components/ui/textarea";
<<<<<<< HEAD
<<<<<<< HEAD
=======
import type { QueueNode } from "@/utils/meetingInterface";
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
=======
>>>>>>> 4afc7a7 (Add missing UI components and fix TypeScript errors)

const props = defineProps<{
    meetingId: string;
}>();

const meetingStore = useMeetingStore();
<<<<<<< HEAD
<<<<<<< HEAD
const { activeMeeting, currentStatus } = storeToRefs(meetingStore);
=======
const { activeMeeting, currentStatus, isGenerating } = storeToRefs(meetingStore);
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
=======
const { activeMeeting, currentStatus } = storeToRefs(meetingStore);
>>>>>>> 4afc7a7 (Add missing UI components and fix TypeScript errors)

const userInput = ref("");
const chatRef = ref<InstanceType<typeof MeetingChat>>();
const abortController = ref<AbortController | null>(null);

const canStart = computed(() => {
    return (
        currentStatus.value === "idle" &&
        activeMeeting.value?.roles &&
        activeMeeting.value.roles.length > 0
    );
});

<<<<<<< HEAD
const canStartFromCurrent = computed(() => {
    return (
        currentStatus.value === "idle" &&
        activeMeeting.value?.roles &&
        activeMeeting.value.roles.length > 0
    );
});

=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
const canPause = computed(() => {
    return currentStatus.value === "running";
});

const canResume = computed(() => {
<<<<<<< HEAD
    return (
        currentStatus.value === "paused" || currentStatus.value === "stopped"
    );
});

const canStop = computed(() => {
    return (
        currentStatus.value === "running" || currentStatus.value === "paused"
    );
});

const autoCycleEnabled = computed(
    () => activeMeeting.value?.autoCycle ?? false,
);

const canSummarize = computed(() => {
    const meeting = activeMeeting.value;
    if (!meeting) return false;
    return (meeting.messages?.length ?? 0) > 0;
});

async function exportMeetingMarkdown() {
    const md = await meetingStore.exportMeetingMarkdown(props.meetingId);
    const title = (activeMeeting.value?.title || "会议").trim() || "会议";
    const safeName = title.replace(/[\\/:*?"<>|]/g, "-");
    const defaultName = `${safeName}.md`;

    // 优先走 Tauri：弹出保存对话框
    try {
        const dialog = await import("@tauri-apps/plugin-dialog");
        const fs = await import("@tauri-apps/plugin-fs");
        const path = await (dialog as any).save?.({
            defaultPath: defaultName,
            filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (!path) return;

        await (fs as any).writeTextFile(path, md);
        (window as any).ElMessage?.success?.("已导出 Markdown");
        return;
    } catch (e) {
        // ignore
        console.log(`Tauri 保存失败，使用 Web fallback：${e}`);
    }

    // Web fallback：下载
    try {
        const blob = new Blob([md], {
            type: "text/markdown;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        (window as any).ElMessage?.success?.("已导出 Markdown");
    } catch {
        try {
            await navigator.clipboard.writeText(md);
            (window as any).ElMessage?.success?.("已复制 Markdown 到剪贴板");
        } catch {
            (window as any).ElMessage?.error?.("导出失败");
        }
    }
}

=======
    return currentStatus.value === "paused";
});

const canStop = computed(() => {
    return currentStatus.value === "running" || currentStatus.value === "paused";
});

>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
async function startMeeting() {
    await meetingStore.startMeeting(props.meetingId);
    // 开始自动推进
    await processQueue();
}

<<<<<<< HEAD
async function startMeetingFromCurrent() {
    await meetingStore.startMeetingFromCurrent(props.meetingId);
    await processQueue();
}

=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
async function pauseMeeting() {
    await meetingStore.pauseMeeting(props.meetingId);
    // 停止当前生成
    if (abortController.value) {
        abortController.value.abort();
        abortController.value = null;
    }
}

async function resumeMeeting() {
    await meetingStore.resumeMeeting(props.meetingId);
    // 继续推进队列
    await processQueue();
}

async function stopMeeting() {
<<<<<<< HEAD
    try {
        await ElMessageBox.confirm("确定要停止会议吗？", "提示", {
            type: "warning",
            confirmButtonText: "停止",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    await meetingStore.stopMeeting(props.meetingId);
    if (abortController.value) {
        abortController.value.abort();
        abortController.value = null;
    }
}

async function toggleAutoCycle() {
    await meetingStore.toggleAutoCycle(props.meetingId);
}

async function summarizeMeetingNow() {
    if (!chatRef.value) return;
    try {
        abortController.value = new AbortController();
        await chatRef.value.generateMeetingSummary(abortController.value);
    } catch (error: any) {
        if (error?.name === "AbortError") return;
        console.error("总结会议失败:", error);
    } finally {
        abortController.value = null;
=======
    if (confirm("确定要停止会议吗？")) {
        await meetingStore.stopMeeting(props.meetingId);
        if (abortController.value) {
            abortController.value.abort();
            abortController.value = null;
        }
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
    }
}

async function sendUserMessage() {
    const content = userInput.value.trim();
    if (!content) return;

    // 添加用户消息
    await meetingStore.addMessage(props.meetingId, {
        role: "user",
        content,
        speakerId: "user",
        speakerName: "用户",
        speakerAvatar: "👤",
        speakerColor: "#6b7280",
    });

    userInput.value = "";

    // 如果会议是暂停状态，发送消息后自动恢复运行
    if (currentStatus.value === "paused") {
        await meetingStore.resumeMeeting(props.meetingId);
        await nextTick();
        await processQueue();
    }
}

// 队列处理逻辑
async function processQueue() {
    while (currentStatus.value === "running") {
        const meeting = activeMeeting.value;
<<<<<<< HEAD
        if (
            !meeting ||
            !meeting.speakerQueue ||
            meeting.speakerQueue.length === 0
        ) {
=======
        if (!meeting || !meeting.speakerQueue || meeting.speakerQueue.length === 0) {
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
            // 队列为空，暂停会议
            await meetingStore.pauseMeeting(props.meetingId);
            break;
        }

        const currentIndex = meeting.currentSpeakerIndex ?? 0;
        if (currentIndex >= meeting.speakerQueue.length) {
            // 已到队列末尾
<<<<<<< HEAD
            if (meeting.autoCycle && meeting.speakerQueue.length > 0) {
                await meetingStore.setCurrentSpeakerIndex(props.meetingId, 0);
                continue;
            }
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
            await meetingStore.pauseMeeting(props.meetingId);
            break;
        }

        const currentNode = meeting.speakerQueue[currentIndex];

        if (currentNode.type === "role" && currentNode.roleId) {
            // AI 角色发言
            await generateRoleSpeech(currentNode.roleId);
        } else if (currentNode.type === "user") {
            // 等待用户发言（暂停）
            await meetingStore.pauseMeeting(props.meetingId);
            break;
        } else if (currentNode.type === "task") {
            // 执行任务（如总结）
<<<<<<< HEAD
            if (currentNode.taskType === "总结会议") {
                if (chatRef.value) {
                    try {
                        abortController.value = new AbortController();
                        await chatRef.value.generateMeetingSummary(
                            abortController.value,
                        );
                    } finally {
                        abortController.value = null;
                    }
                }
            }
=======
            // TODO: 实现任务执行逻辑
            await meetingStore.advanceQueue(props.meetingId);
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
        }

        // 检查是否应该继续
        if (currentStatus.value !== "running") {
            break;
        }

        // 推进队列
        await meetingStore.advanceQueue(props.meetingId);
    }
}

async function generateRoleSpeech(roleId: string) {
    const meeting = activeMeeting.value;
    if (!meeting) return;

    const role = meeting.roles.find((r) => r.id === roleId);
    if (!role) return;

    try {
        // 创建 AbortController
        abortController.value = new AbortController();

        // 通过 chatRef 调用生成方法
        if (chatRef.value) {
<<<<<<< HEAD
            await chatRef.value.generateRoleMessage(
                role,
                abortController.value,
            );
=======
            await chatRef.value.generateRoleMessage(role, abortController.value);
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
        }
    } catch (error: any) {
        if (error.name === "AbortError") {
            console.log("消息生成被取消");
        } else {
            console.error("生成消息失败:", error);
            // 暂停会议
            await meetingStore.pauseMeeting(props.meetingId);
        }
    } finally {
        abortController.value = null;
    }
}

// 监听会议状态变化
watch(currentStatus, (newStatus) => {
    console.log("会议状态变化:", newStatus);
});

// 清理
onUnmounted(() => {
    if (abortController.value) {
        abortController.value.abort();
    }
});
</script>

<template>
    <div class="flex h-full overflow-hidden">
        <!-- 左侧：角色列表 -->
        <aside class="w-64 border-r bg-muted/10 flex-shrink-0">
            <RoleList :meeting-id="meetingId" />
        </aside>

        <!-- 中间：聊天区域 -->
        <main class="flex-1 flex flex-col min-w-0">
            <!-- 会议控制栏 -->
            <div class="border-b px-4 py-3 flex items-center gap-2">
                <div class="flex items-center gap-2">
                    <Button
                        v-if="canStart"
                        @click="startMeeting"
                        size="sm"
                        class="gap-2"
                    >
                        <Play class="w-4 h-4" />
                        开始会议
                    </Button>
                    <Button
<<<<<<< HEAD
                        v-if="canStartFromCurrent"
                        @click="startMeetingFromCurrent"
                        size="sm"
                        variant="outline"
                        class="gap-2"
                    >
                        <Play class="w-4 h-4" />
                        从当前开始发言
                    </Button>
                    <Button
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
                        v-if="canPause"
                        @click="pauseMeeting"
                        size="sm"
                        variant="outline"
                        class="gap-2"
                    >
                        <Pause class="w-4 h-4" />
                        暂停
                    </Button>
                    <Button
                        v-if="canResume"
                        @click="resumeMeeting"
                        size="sm"
                        class="gap-2"
                    >
                        <Play class="w-4 h-4" />
<<<<<<< HEAD
                        {{ currentStatus === "stopped" ? "继续会议" : "继续" }}
=======
                        继续
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
                    </Button>
                    <Button
                        v-if="canStop"
                        @click="stopMeeting"
                        size="sm"
                        variant="destructive"
                        class="gap-2"
                    >
                        <StopCircle class="w-4 h-4" />
                        停止
                    </Button>
                </div>
                <div class="flex-1"></div>
<<<<<<< HEAD
                <div class="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        class="gap-2"
                        @click="toggleAutoCycle"
                    >
                        <Repeat class="w-4 h-4" />
                        自动循环：{{ autoCycleEnabled ? "开" : "关" }}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        class="gap-2"
                        :disabled="meetingStore.isGenerating"
                        @click="exportMeetingMarkdown"
                    >
                        <Download class="w-4 h-4" />
                        导出 Markdown
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        class="gap-2"
                        :disabled="!canSummarize || meetingStore.isGenerating"
                        @click="summarizeMeetingNow"
                    >
                        <FileText class="w-4 h-4" />
                        总结会议
                    </Button>
                </div>
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
                <div class="text-sm">
                    <span
                        class="px-2 py-1 rounded-full text-xs font-medium"
                        :class="{
                            'bg-green-500/20 text-green-700 dark:text-green-400':
                                currentStatus === 'running',
                            'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400':
                                currentStatus === 'paused',
                            'bg-gray-500/20 text-gray-700 dark:text-gray-400':
                                currentStatus === 'idle' ||
                                currentStatus === 'stopped',
                        }"
                    >
                        {{
                            currentStatus === "running"
                                ? "进行中"
                                : currentStatus === "paused"
                                  ? "已暂停"
                                  : currentStatus === "stopped"
                                    ? "已停止"
                                    : "未开始"
                        }}
                    </span>
                </div>
            </div>

            <!-- 聊天消息 -->
            <div class="flex-1 overflow-hidden">
                <MeetingChat ref="chatRef" :meeting-id="meetingId" />
            </div>

            <!-- 用户输入区 -->
            <div class="border-t p-4">
                <div class="flex gap-2">
                    <Textarea
                        v-model="userInput"
                        placeholder="输入你的观点和意见... (Enter发送，Shift+Enter换行)"
                        rows="2"
                        class="resize-none"
                        @keydown.enter.exact.prevent="sendUserMessage"
                    />
                    <Button
                        @click="sendUserMessage"
                        :disabled="!userInput.trim()"
                        class="gap-2"
                    >
                        <Send class="w-4 h-4" />
                        发送
                    </Button>
                </div>
            </div>
        </main>

        <!-- 右侧：发言队列 -->
        <aside class="w-80 border-l bg-muted/10 flex-shrink-0">
            <SpeakerQueue :meeting-id="meetingId" />
        </aside>
    </div>
</template>
