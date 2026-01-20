<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, RefreshCw } from "lucide-vue-next";
import type { MeetingRole, MeetingMessage } from "@/utils/meetingInterface";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{
    meetingId: string;
}>();

const meetingStore = useMeetingStore();
const { currentMessages, activeMeeting } = storeToRefs(meetingStore);

const chatContainer = ref<HTMLElement>();
const editingMessageId = ref<string | null>(null);
const editingContent = ref("");

// 自动滚动到底部
watch(
    currentMessages,
    async () => {
        await nextTick();
        scrollToBottom();
    },
    { deep: true },
);

function scrollToBottom() {
    if (chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
}

function startEditMessage(msg: MeetingMessage) {
    editingMessageId.value = msg.id;
    editingContent.value = msg.content;
}

async function saveEditMessage(msgId: string) {
    if (editingContent.value.trim()) {
        await meetingStore.updateMessage(props.meetingId, msgId, {
            content: editingContent.value.trim(),
        });
    }
    editingMessageId.value = null;
}

function cancelEditMessage() {
    editingMessageId.value = null;
}

async function deleteMessage(msgId: string) {
    if (confirm("确定要删除这条消息吗？")) {
        await meetingStore.deleteMessage(props.meetingId, msgId);
    }
}

async function regenerateMessage(msg: MeetingMessage) {
    // 删除当前消息并重新生成
    const meeting = activeMeeting.value;
    if (!meeting || msg.role !== "assistant") return;

    const role = meeting.roles.find((r) => r.id === msg.speakerId);
    if (!role) return;

    // 删除当前消息
    await meetingStore.deleteMessage(props.meetingId, msg.id);

    // 重新生成
    try {
        const abortController = new AbortController();
        await generateRoleMessage(role, abortController);
    } catch (error) {
        console.error("重新生成失败:", error);
    }
}

// 暴露给父组件的方法：生成角色消息
async function generateRoleMessage(
    role: MeetingRole,
    abortController: AbortController,
) {
    const meeting = activeMeeting.value;
    if (!meeting) return;

    // 构建上下文：全局摘要 + 历史消息
    const systemPrompt = `${meeting.summary}\n\n你的角色设定：\n${role.systemPrompt}`;

    // 构建消息历史
    const messages = [
        { role: "system", content: systemPrompt },
        ...meeting.messages.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: `【${m.speakerName}】: ${m.content}`,
        })),
    ];

    // 创建占位消息
    const messageId = await meetingStore.addMessage(props.meetingId, {
        role: "assistant",
        content: "",
        speakerId: role.id,
        speakerName: role.name,
        speakerAvatar: role.avatar,
        speakerColor: role.color,
        isGenerating: true,
    });

    if (!messageId) return;

    try {
        // 调用后端API生成消息
        const host = import.meta.env.VITE_API_HOST || "http://localhost:3000";
        const response = await fetch(`${host}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: role.modelId,
                messages,
                stream: true,
            }),
            signal: abortController.signal,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") continue;

                        try {
                            const json = JSON.parse(data);
                            const content = json.choices?.[0]?.delta?.content;
                            if (content) {
                                accumulatedContent += content;
                                // 更新消息内容
                                await meetingStore.updateMessage(
                                    props.meetingId,
                                    messageId,
                                    { content: accumulatedContent },
                                );
                            }
                        } catch (e) {
                            console.warn("Failed to parse SSE data:", e);
                        }
                    }
                }
            }
        }

        // 标记生成完成
        await meetingStore.updateMessage(props.meetingId, messageId, {
            isGenerating: false,
        });
    } catch (error: any) {
        if (error.name === "AbortError") {
            // 生成被取消，删除占位消息
            await meetingStore.deleteMessage(props.meetingId, messageId);
        } else {
            console.error("生成消息失败:", error);
            // 标记为错误
            await meetingStore.updateMessage(props.meetingId, messageId, {
                content: "生成失败，请重试",
                isGenerating: false,
            });
        }
        throw error;
    }
}

// 暴露方法给父组件
defineExpose({
    generateRoleMessage,
});
</script>

<template>
    <div ref="chatContainer" class="h-full overflow-y-auto p-4 space-y-4">
        <div
            v-if="!currentMessages.length"
            class="flex items-center justify-center h-full text-muted-foreground"
        >
            <div class="text-center">
                <p class="text-lg">会议尚未开始</p>
                <p class="text-sm mt-2">点击"开始会议"让AI角色们开始讨论</p>
            </div>
        </div>

        <div
            v-for="msg in currentMessages"
            :key="msg.id"
            class="flex gap-3 group"
        >
            <!-- 头像 -->
            <div
                class="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
                :style="{
                    backgroundColor: (msg.speakerColor || '#6b7280') + '20',
                }"
            >
                {{ msg.speakerAvatar || "👤" }}
            </div>

            <!-- 消息内容 -->
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <span class="font-semibold">{{ msg.speakerName }}</span>
                    <span class="text-xs text-muted-foreground">
                        {{ new Date(msg.timestamp).toLocaleTimeString() }}
                    </span>
                </div>

                <!-- 编辑模式 -->
                <div v-if="editingMessageId === msg.id" class="space-y-2">
                    <Textarea
                        v-model="editingContent"
                        rows="4"
                        class="resize-none"
                    />
                    <div class="flex gap-2">
                        <Button size="sm" @click="saveEditMessage(msg.id)">
                            保存
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            @click="cancelEditMessage"
                        >
                            取消
                        </Button>
                    </div>
                </div>

                <!-- 显示模式 -->
                <div v-else>
                    <div
                        class="prose prose-sm dark:prose-invert max-w-none"
                        :class="{ 'opacity-50': msg.isGenerating }"
                    >
                        <p class="whitespace-pre-wrap">{{ msg.content }}</p>
                        <span
                            v-if="msg.isGenerating"
                            class="inline-block animate-pulse"
                        >
                            ▌
                        </span>
                    </div>

                    <!-- 操作按钮（hover显示） -->
                    <div
                        class="opacity-0 group-hover:opacity-100 transition-opacity mt-2 flex gap-1"
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                            @click="startEditMessage(msg)"
                            :disabled="msg.isGenerating"
                        >
                            <Edit class="w-3 h-3 mr-1" />
                            编辑
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            @click="deleteMessage(msg.id)"
                            :disabled="msg.isGenerating"
                        >
                            <Trash2 class="w-3 h-3 mr-1" />
                            删除
                        </Button>
                        <Button
                            v-if="msg.role === 'assistant'"
                            variant="ghost"
                            size="sm"
                            @click="regenerateMessage(msg)"
                            :disabled="msg.isGenerating"
                        >
                            <RefreshCw class="w-3 h-3 mr-1" />
                            重新生成
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
