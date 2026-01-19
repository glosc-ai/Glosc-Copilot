<script setup lang="ts">
<<<<<<< HEAD
import type { ChatStatus } from "ai";
import { ref, watch, nextTick, computed, shallowRef, onMounted } from "vue";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, RefreshCw, CopyIcon } from "lucide-vue-next";
import type { UIMessage } from "ai";
import type { MeetingRole, MeetingMessage } from "@/utils/meetingInterface";
import { Textarea } from "@/components/ui/textarea";
import ChatMessageItem from "@/components/chat/ChatMessageItem.vue";
import { meetingMessagesToUiMessages } from "@/utils/MeetingUiMessageAdapter";
import { useMcpStore } from "@/stores/mcp";
import { McpUtils } from "@/utils/McpUtils";
import { ChatUtils } from "@/utils/ChatUtils";
=======
import { ref, computed, watch, nextTick } from "vue";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, RefreshCw } from "lucide-vue-next";
import type { MeetingRole, MeetingMessage } from "@/utils/meetingInterface";
import { Textarea } from "@/components/ui/textarea";
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)

const props = defineProps<{
    meetingId: string;
}>();

const meetingStore = useMeetingStore();
const { currentMessages, activeMeeting } = storeToRefs(meetingStore);
<<<<<<< HEAD
const mcpStore = useMcpStore();

onMounted(() => {
    void mcpStore.init();
});

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
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)

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

<<<<<<< HEAD
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
    tools?: Record<string, any>;
    triggerText?: string;
};

async function streamToMeetingMessage(params: StreamToMessageParams) {
    const { model, messages, abortController, messageId } = params;
    const tools = params.tools || {};
    const triggerText = (params.triggerText ?? "").trim();

    // 会议模式改用 ai-sdk 的 Chat（支持 tool calling 自动回填），并把内容同步回 meeting store。
    const clientToolsRef = shallowRef<Record<string, any> | null>(tools);
    const chat = ChatUtils.getChat({
        toolsRef: clientToolsRef,
        debugTools: false,
    });

    // 预置上下文
    (chat as any).messages = messages as any;

    const getAssistantSnapshot = () => {
        const all: any[] = (chat as any).messages || [];
        for (let i = all.length - 1; i >= 0; i -= 1) {
            const m = all[i];
            if (m?.role === "assistant") {
                const parts: any[] = Array.isArray(m.parts) ? m.parts : [];
                const content = parts
                    .filter((p) => p?.type === "text")
                    .map((p) => p?.text ?? "")
                    .join("");
                const reasoning = parts
                    .filter((p) => p?.type === "reasoning")
                    .map((p) => p?.text ?? "")
                    .join("");
                return {
                    content,
                    reasoning: reasoning || "",
                };
            }
        }
        return { content: "", reasoning: "" };
    };

    let accumulatedContent = "";
    let accumulatedReasoning = "";
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

    const stopOnAbort = () => {
        try {
            void (chat as any).stop?.();
        } catch {
            // ignore
        }
    };
    if (abortController?.signal?.aborted) stopOnAbort();
    abortController?.signal?.addEventListener?.("abort", stopOnAbort, {
        once: true,
    });

    meetingStore.isGenerating = true;
    meetingStore.generatingMessageId = messageId;

    // 这里必须发送一条 user 消息作为触发；不写入 meeting.messages（仅用于本次请求）。
    const effectiveTriggerText =
        triggerText || "现在轮到你发言。请基于会议背景与历史讨论继续推进。";

    try {
        const sendPromise = (chat as any).sendMessage(
            { text: effectiveTriggerText },
            {
                body: {
                    model,
                    mcpEnabled: Object.keys(tools || {}).length > 0,
                    tools,
                },
            },
        );

        // streaming 同步回 meeting store
        while (true) {
            const s: any = (chat as any).status;
            const statusText = typeof s === "string" ? s : s?.value;

            const snap = getAssistantSnapshot();
            if (
                snap.content !== accumulatedContent ||
                snap.reasoning !== accumulatedReasoning
            ) {
                accumulatedContent = snap.content;
                accumulatedReasoning = snap.reasoning;
                scheduleFlush();
            }

            if (statusText !== "submitted" && statusText !== "streaming") {
                break;
            }
            await new Promise((r) => window.setTimeout(r, 80));
        }

        await sendPromise;
    } finally {
        abortController?.signal?.removeEventListener?.("abort", stopOnAbort);
    }

    if (flushTimer != null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
    }

    // 最后再同步一次
    const finalSnap = getAssistantSnapshot();
    accumulatedContent = finalSnap.content;
    accumulatedReasoning = finalSnap.reasoning;

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

    await mcpStore.init();

    // 按角色启用 MCP Server（不同 AI 可用不同工具）
    const enabledIds = new Set(role.enabledMcpServerIds || []);
    const toolServers = (mcpStore.servers || []).map((s: any) => ({
        ...s,
        enabled: enabledIds.has(s.id),
    }));
    const tools =
        enabledIds.size > 0
            ? await McpUtils.getTools(toolServers as any, {
                  skipStopDisabled: true,
              })
            : {};

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
=======
async function deleteMessage(msgId: string) {
    if (confirm("确定要删除这条消息吗？")) {
        await meetingStore.deleteMessage(props.meetingId, msgId);
    }
}

async function regenerateMessage(msg: MeetingMessage) {
    // TODO: 实现重新生成逻辑
    console.log("Regenerate message:", msg);
}

// 暴露给父组件的方法：生成角色消息
async function generateRoleMessage(role: MeetingRole, abortController: AbortController) {
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
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)

    if (!messageId) return;

    try {
<<<<<<< HEAD
        await streamToMeetingMessage({
            model: role.modelId,
            messages,
            abortController,
            messageId,
            tools,
            triggerText: `现在轮到你（${role.name}）发言。请用你的角色立场继续推进讨论，直接输出你的发言内容。`,
        });
    } catch (error: any) {
        meetingStore.isGenerating = false;
        meetingStore.generatingMessageId = null;
=======
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
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
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

<<<<<<< HEAD
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
            tools: {},
            triggerText: "请生成本次会议总结。",
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
=======
// 暴露方法给父组件
defineExpose({
    generateRoleMessage,
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
});
</script>

<template>
<<<<<<< HEAD
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
=======
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
                :style="{ backgroundColor: (msg.speakerColor || '#6b7280') + '20' }"
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
                        <span v-if="msg.isGenerating" class="inline-block animate-pulse">
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
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
    </div>
</template>
