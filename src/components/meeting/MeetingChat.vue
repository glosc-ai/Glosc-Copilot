<script setup lang="ts">
import type { ChatStatus } from "ai";
import { ref, watch, nextTick, computed } from "vue";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, RefreshCw, CopyIcon } from "lucide-vue-next";
import type { UIMessage } from "ai";
import type { MeetingRole, MeetingMessage } from "@/utils/meetingInterface";
import { Textarea } from "@/components/ui/textarea";
import ChatMessageItem from "@/components/chat/ChatMessageItem.vue";
import { meetingMessagesToUiMessages } from "@/utils/MeetingUiMessageAdapter";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{
    meetingId: string;
}>();

const meetingStore = useMeetingStore();
const { currentMessages, activeMeeting } = storeToRefs(meetingStore);
const authStore = useAuthStore();

const uiMessages = computed(() =>
    meetingMessagesToUiMessages(currentMessages.value),
);

const lastMessageId = computed(() => {
    // 若 store 记录了正在生成的消息，优先用于 streaming 标记
    if (meetingStore.generatingMessageId)
        return meetingStore.generatingMessageId;
    const last = uiMessages.value[uiMessages.value.length - 1];
    return last?.id ?? null;
});

const lastAssistantMessageId = computed(() => {
    for (let i = uiMessages.value.length - 1; i >= 0; i -= 1) {
        const m: any = uiMessages.value[i];
        if (m?.role === "assistant") return m.id;
    }
    return null;
});

const status = computed<ChatStatus>(() => {
    // Meeting 模式没有 ai-sdk 的 ChatStatus，这里用 isGenerating 近似映射
    const hasGenerating = (currentMessages.value ?? []).some(
        (m) => m.isGenerating,
    );
    return hasGenerating ? "streaming" : "ready";
});

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

function formatTime(ts?: number) {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString();
}

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        (window as any).ElMessage?.success?.("已复制");
    } catch {
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            (window as any).ElMessage?.success?.("已复制");
        } catch {
            (window as any).ElMessage?.error?.("复制失败");
        }
    }
}

async function deleteMessage(msgId: string) {
    try {
        await ElMessageBox.confirm("确定要删除这条消息吗？", "提示", {
            type: "warning",
            confirmButtonText: "删除",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    await meetingStore.deleteMessage(props.meetingId, msgId);
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

type StreamToMessageParams = {
    model: string;
    messages: UIMessage[];
    abortController: AbortController;
    messageId: string;
};

async function streamToMeetingMessage(params: StreamToMessageParams) {
    const { model, messages, abortController, messageId } = params;

    if (!authStore.isLoggedIn || !authStore.token) {
        (window as any).ElMessage?.error?.("请先登录后再开始会议对话");
        throw new Error("Unauthorized");
    }

    const host = import.meta.env.VITE_API_HOST || "http://localhost:3000";
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authStore.token}`,
    };

    const response = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, messages, stream: true }),
        signal: abortController.signal,
    });

    if (response.status === 401 || response.status === 403) {
        try {
            await authStore.logout();
        } catch {
            // ignore
        }
        (window as any).ElMessage?.error?.("登录已过期，请重新登录");
        throw new Error("Unauthorized");
    }

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    meetingStore.isGenerating = true;
    meetingStore.generatingMessageId = messageId;

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = "";
    let accumulatedReasoning = "";

    const extractDelta = (json: any) => {
        const textDelta: string | undefined =
            json?.choices?.[0]?.delta?.content ??
            json?.delta?.content ??
            json?.textDelta ??
            json?.contentDelta ??
            json?.delta;

        const reasoningDelta: string | undefined =
            json?.reasoningDelta ??
            json?.choices?.[0]?.delta?.reasoning ??
            (json?.type === "reasoning-delta" ? json?.textDelta : undefined);

        return { textDelta, reasoningDelta };
    };

    let flushTimer: number | null = null;
    let lastFlushedContent = "";
    let lastFlushedReasoning = "";
    const scheduleFlush = () => {
        if (flushTimer != null) return;
        flushTimer = window.setTimeout(async () => {
            flushTimer = null;
            if (
                accumulatedContent === lastFlushedContent &&
                accumulatedReasoning === lastFlushedReasoning
            )
                return;

            lastFlushedContent = accumulatedContent;
            lastFlushedReasoning = accumulatedReasoning;
            await meetingStore.updateMessage(
                props.meetingId,
                messageId,
                {
                    content: accumulatedContent,
                    reasoning: accumulatedReasoning || undefined,
                },
                { persist: false },
            );
        }, 80);
    };

    if (reader) {
        let buffer = "";

        const handleDataLine = (data: string) => {
            if (!data) return;
            if (data === "[DONE]") return;

            try {
                const json = JSON.parse(data);
                const { textDelta, reasoningDelta } = extractDelta(json);

                if (typeof textDelta === "string" && textDelta.length > 0) {
                    accumulatedContent += textDelta;
                    scheduleFlush();
                }
                if (
                    typeof reasoningDelta === "string" &&
                    reasoningDelta.length > 0
                ) {
                    accumulatedReasoning += reasoningDelta;
                    scheduleFlush();
                }
            } catch (e) {
                if (!data.trim().startsWith("{")) {
                    accumulatedContent += data;
                    scheduleFlush();
                    return;
                }
                console.warn("Failed to parse SSE data:", e);
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex >= 0) {
                const rawLine = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);

                const line = rawLine.replace(/\r$/, "");
                if (line.startsWith("data:")) {
                    handleDataLine(line.slice(5).trimStart());
                }

                newlineIndex = buffer.indexOf("\n");
            }
        }

        const tail = buffer.trim();
        if (tail.startsWith("data:")) {
            handleDataLine(tail.slice(5).trimStart());
        }
    }

    if (flushTimer != null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (
        accumulatedContent !== lastFlushedContent ||
        accumulatedReasoning !== lastFlushedReasoning
    ) {
        await meetingStore.updateMessage(
            props.meetingId,
            messageId,
            {
                content: accumulatedContent,
                reasoning: accumulatedReasoning || undefined,
            },
            { persist: false },
        );
    }

    // 会话结束：一次性落盘（避免流式过程频繁写 store）
    await meetingStore.updateMessage(
        props.meetingId,
        messageId,
        {
            content: accumulatedContent,
            reasoning: accumulatedReasoning || undefined,
            isGenerating: false,
        },
        { persist: true },
    );
    meetingStore.isGenerating = false;
    meetingStore.generatingMessageId = null;
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

    // 构建消息历史（与 ChatArea 保持一致：UIMessage + parts）
    const messages: UIMessage[] = [
        {
            id: `system-${props.meetingId}`,
            role: "system" as any,
            parts: [{ type: "text", text: systemPrompt }] as any,
        } as any,
        ...meeting.messages.map(
            (m) =>
                ({
                    id: m.id,
                    role: m.role as any,
                    parts: [
                        {
                            type: "text",
                            text: `【${m.speakerName}】: ${m.content}`,
                        },
                    ] as any,
                }) as any,
        ),
    ];

    // 创建占位消息
    const messageId = await meetingStore.addMessage(
        props.meetingId,
        {
            role: "assistant",
            content: "",
            speakerId: role.id,
            speakerName: role.name,
            speakerAvatar: role.avatar,
            speakerColor: role.color,
            isGenerating: true,
        },
        { persist: false },
    );

    if (!messageId) return;

    try {
        await streamToMeetingMessage({
            model: role.modelId,
            messages,
            abortController,
            messageId,
        });
    } catch (error: any) {
        meetingStore.isGenerating = false;
        meetingStore.generatingMessageId = null;
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

async function generateMeetingSummary(abortController: AbortController) {
    const meeting = activeMeeting.value;
    if (!meeting) return;

    const modelId = meeting.roles?.[0]?.modelId;
    if (!modelId) {
        (window as any).ElMessage?.warning?.(
            "请先添加至少一个角色（用于选择模型）",
        );
        return;
    }

    const history = (meeting.messages ?? []).slice(-120);
    const systemPrompt = `你是会议纪要与总结助手。\n\n会议背景：\n${meeting.summary}\n\n请基于对话记录输出结构化总结（中文，简洁但信息密度高）：\n1）会议主题（一句话）\n2）关键结论（要点列表）\n3）决策与共识（如有）\n4）待办事项（负责人/截止时间/依赖，若未知写“待定”）\n5）风险与分歧（如有）\n6）下一步建议`;

    const messages: UIMessage[] = [
        {
            id: `system-summary-${props.meetingId}`,
            role: "system" as any,
            parts: [{ type: "text", text: systemPrompt }] as any,
        } as any,
        ...history.map(
            (m) =>
                ({
                    id: m.id,
                    role: m.role as any,
                    parts: [
                        {
                            type: "text",
                            text: `【${m.speakerName}】: ${m.content}`,
                        },
                    ] as any,
                }) as any,
        ),
        {
            id: `user-summary-${props.meetingId}`,
            role: "user" as any,
            parts: [{ type: "text", text: "请生成本次会议总结。" }] as any,
        } as any,
    ];

    const messageId = await meetingStore.addMessage(
        props.meetingId,
        {
            role: "assistant",
            content: "",
            speakerId: "system",
            speakerName: "会议总结",
            speakerAvatar: "📋",
            speakerColor: "#8b5cf6",
            isGenerating: true,
        },
        { persist: false },
    );

    if (!messageId) return;

    try {
        await streamToMeetingMessage({
            model: modelId,
            messages,
            abortController,
            messageId,
        });
    } catch (error: any) {
        meetingStore.isGenerating = false;
        meetingStore.generatingMessageId = null;
        if (error.name === "AbortError") {
            await meetingStore.deleteMessage(props.meetingId, messageId);
        } else {
            console.error("生成会议总结失败:", error);
            await meetingStore.updateMessage(props.meetingId, messageId, {
                content: "会议总结生成失败，请重试",
                isGenerating: false,
            });
        }
        throw error;
    }
}

// 暴露方法给父组件
defineExpose({
    generateRoleMessage,
    generateMeetingSummary,
});
</script>

<template>
    <div ref="chatContainer" class="h-full overflow-y-auto p-4">
        <Conversation class="h-full">
            <ConversationContent>
                <ConversationEmptyState v-if="uiMessages.length === 0">
                    <div class="text-center text-muted-foreground">
                        <p class="text-lg">会议尚未开始</p>
                        <p class="text-sm mt-2">
                            点击"开始会议"让AI角色们开始讨论
                        </p>
                    </div>
                </ConversationEmptyState>

                <template v-else>
                    <div
                        v-for="(msg, idx) in uiMessages"
                        :key="msg.id"
                        class="group"
                    >
                        <ChatMessageItem
                            :message="msg"
                            :message-index="idx"
                            :status="status"
                            :last-message-id="lastMessageId"
                            :last-assistant-message-id="lastAssistantMessageId"
                            @copy="copyToClipboard"
                            @regenerate="
                                () => regenerateMessage(currentMessages[idx])
                            "
                        >
                            <template
                                #text="{
                                    message,
                                    part,
                                    partIndex,
                                    isLastTextPart,
                                    isStreaming,
                                }"
                            >
                                <template
                                    v-if="
                                        editingMessageId === message.id &&
                                        isLastTextPart
                                    "
                                >
                                    <Textarea
                                        v-model="editingContent"
                                        rows="4"
                                        class="resize-none"
                                    />
                                    <div class="flex gap-2 mt-2">
                                        <Button
                                            size="sm"
                                            @click="saveEditMessage(message.id)"
                                        >
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
                                </template>
                                <template v-else>
                                    <div
                                        v-if="partIndex === 0"
                                        class="flex items-center gap-2 mb-1 text-xs text-muted-foreground"
                                    >
                                        <span
                                            class="inline-flex items-center justify-center w-5 h-5 rounded-full"
                                            :style="{
                                                backgroundColor:
                                                    ((message as any)
                                                        .speakerColor ||
                                                        '#6b7280') + '20',
                                            }"
                                        >
                                            {{
                                                (message as any)
                                                    .speakerAvatar || "👤"
                                            }}
                                        </span>
                                        <span
                                            class="font-medium text-foreground/80"
                                        >
                                            {{
                                                (message as any).speakerName ||
                                                (message.role === "user"
                                                    ? "用户"
                                                    : "助手")
                                            }}
                                        </span>
                                        <span>
                                            {{
                                                formatTime(
                                                    (message as any).timestamp,
                                                )
                                            }}
                                        </span>
                                    </div>

                                    <MessageResponse
                                        :id="`${message.id}-text-${partIndex}`"
                                        :content="part.text"
                                        :is-streaming="isStreaming"
                                        :class="{
                                            'opacity-50': (message as any)
                                                .isGenerating,
                                        }"
                                    />
                                </template>
                            </template>

                            <template
                                #assistant-actions="{
                                    message,
                                    part,
                                    timestampText,
                                }"
                            >
                                <MessageActions>
                                    <MessageAction
                                        v-if="message.role === 'assistant'"
                                        label="重新生成"
                                        @click="
                                            regenerateMessage(
                                                currentMessages[idx],
                                            )
                                        "
                                    >
                                        <RefreshCw class="size-3" />
                                    </MessageAction>
                                    <MessageAction
                                        label="复制"
                                        @click="copyToClipboard(part.text)"
                                    >
                                        <CopyIcon class="size-3" />
                                    </MessageAction>
                                    <span
                                        v-if="timestampText"
                                        class="ml-2 text-xs text-muted-foreground"
                                    >
                                        {{ timestampText }}
                                    </span>
                                </MessageActions>

                                <div
                                    class="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        @click="
                                            startEditMessage(
                                                currentMessages[idx],
                                            )
                                        "
                                        :disabled="
                                            (message as any).isGenerating
                                        "
                                    >
                                        <Edit class="w-3 h-3 mr-1" />
                                        编辑
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        @click="deleteMessage(message.id)"
                                        :disabled="
                                            (message as any).isGenerating
                                        "
                                    >
                                        <Trash2 class="w-3 h-3 mr-1" />
                                        删除
                                    </Button>
                                </div>
                            </template>
                        </ChatMessageItem>
                    </div>
                </template>
            </ConversationContent>
        </Conversation>
    </div>
</template>
