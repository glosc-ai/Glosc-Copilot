<script setup lang="ts">
import { type ChatStatus, type SourceUrlUIPart, type UIMessage } from "ai";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ChatUtils } from "@/utils/ChatUtils";

import {
    CopyIcon,
    Server,
    RefreshCcwIcon,
    Check,
    ChevronsUpDown,
    Bot,
    Maximize2,
    MessageSquare,
    Coins,
    Settings2,
} from "lucide-vue-next";

import { formatModelName, groupModelsByProvider } from "@/utils/ModelApi";

import {
    tokenizerJSON,
    tokenizerConfig,
} from "@lenml/tokenizer-claude/src/data.ts";

import { TokenizerLoader } from "@lenml/tokenizers";

import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat";
import { storeToRefs } from "pinia";
import { useMcpStore } from "@/stores/mcp";
import { useRouter } from "vue-router";
// import { nanoid } from "nanoid";

const chatStore = useChatStore();
const { activeKey, conversations, selectedModel, availableModels } =
    storeToRefs(chatStore);
const mcpStore = useMcpStore();
const { servers } = storeToRefs(mcpStore);
const router = useRouter();

const hasEnabledServers = computed(() => servers.value.some((s) => s.enabled));

function toggleServer(id: string, checked: boolean) {
    mcpStore.updateServer(id, { enabled: checked });
}

const groupedModels = computed(() =>
    groupModelsByProvider(availableModels.value)
);
const selectedModelData = computed(() => selectedModel.value);
const openModelSelector = ref(false);

const checkpoints = ref<CheckpointType[]>([]);

onMounted(async () => {
    await mcpStore.init();
    mcpStore.checkConnections();
    if (availableModels.value.length === 0) {
        await chatStore.loadAvailableModels();
    }
});

// 客户端可执行工具表（用于 onToolCall 执行并 addToolOutput 回填）
const clientToolsRef = shallowRef<Record<string, any> | null>(null);
const chat = ChatUtils.getChat({
    toolsRef: clientToolsRef,
    debugTools: false,
});

const status = computed<ChatStatus>(() => chat.status);
const messages = computed<UIMessage[]>(() => chat.messages);
const error = computed(() => chat.error);

watch(error, (newError) => {
    if (newError) {
        console.error("Chat error:", newError);
    }
});

// Sync from Store to Chat
watch(
    activeKey,
    (newKey) => {
        if (!newKey) return;
        const conversation = conversations.value[newKey];
        if (conversation) {
            // Assuming chat.messages is a Ref or writable
            (chat as any).messages.value = conversation.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                parts: m.parts,
            }));
        } else {
            (chat as any).messages.value = [];
        }
    },
    { immediate: true }
);

// Sync from Chat to Store
let syncTimer: number | null = null;
const syncChatToStore = () => {
    if (!activeKey.value || !conversations.value[activeKey.value]) return;

    const currentConversation = conversations.value[activeKey.value];
    const oldMessagesMap = new Map(
        currentConversation.messages.map((m) => [m.id, m])
    );

    const updatedMessages: StoredChatMessage[] = messages.value.map((m) => {
        const old = oldMessagesMap.get(m.id);
        const textContent =
            m.parts
                ?.filter((part) => part.type === "text")
                .map((part) => (part as any).text)
                .join("\n") ?? "";
        return {
            id: m.id,
            role: m.role as any,
            content: textContent,
            timestamp: old ? old.timestamp : Date.now(),
            parts: m.parts,
            reasoning: old?.reasoning,
        };
    });

    currentConversation.messages = updatedMessages;
    chatStore.debouncedSave();
};

const scheduleSyncChatToStore = (delayMs = 200) => {
    if (syncTimer != null) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
        syncTimer = null;
        // 流式期间避免逐 token 深度同步；在结束/非流式时再同步
        if (status.value === "streaming") return;
        syncChatToStore();
    }, delayMs);
};

watch(
    () => messages.value.length,
    () => {
        // 新消息进入（用户/助手占位）时，非流式情况下可以同步一次
        scheduleSyncChatToStore(0);
    }
);

watch(
    () => status.value,
    (next, prev) => {
        // 流式结束时做一次完整同步并保存
        if (prev === "streaming" && next !== "streaming") {
            if (syncTimer != null) {
                window.clearTimeout(syncTimer);
                syncTimer = null;
            }
            syncChatToStore();
            chatStore.saveImmediately();
        }
    }
);

const lastAssistantMessageId = computed(() => {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
        const current = messages.value[index];
        if (current && current.role === "assistant") return current.id;
    }
    return null;
});

const messagesWithCheckpoints = computed(() => {
    return messages.value.map((message, index) => {
        const checkpoint = checkpoints.value.find(
            (cp) => cp.messageIndex === index
        );
        return { message, index, checkpoint };
    });
});

async function handleSubmit(message: PromptInputMessage) {
    const hasText = Boolean(message.text?.trim());
    const hasAttachments = Boolean(message.files?.length);

    if (!hasText && !hasAttachments) return;

    try {
        // Use cached tools to avoid reloading on each message
        const tools = await mcpStore.getCachedTools();

        // 供客户端 onToolCall 使用：真正执行工具并回填 output
        clientToolsRef.value = tools;

        chat.sendMessage(
            {
                text: hasText ? message.text : "Sent with attachments",
            },
            {
                body: {
                    model: selectedModel.value?.id,
                    mcpEnabled: hasEnabledServers.value,
                    tools,
                },
            }
        );
        message.text = "";
    } catch (error) {
        console.error("Failed to send message", error);
    }
}

function handlePromptError(error: { code: string; message: string }) {
    console.error(`Input error (${error.code})`, error.message);
}

const promptInput = usePromptInputProvider({
    onSubmit: handleSubmit,
    onError: handlePromptError,
});

const hasPendingInput = computed(() => {
    return (
        Boolean(promptInput.textInput.value.trim()) ||
        promptInput.files.value.length > 0
    );
});

const submitDisabled = computed(() => !hasPendingInput.value && !status.value);

function getSourceUrlParts(message: UIMessage) {
    return (
        message.parts?.filter(
            (part): part is SourceUrlUIPart => part.type === "source-url"
        ) ?? []
    );
}

function shouldShowActions(message: UIMessage, partIndex: number) {
    if (message.role !== "assistant") return false;
    if (lastAssistantMessageId.value !== message.id) return false;
    return isLastTextPart(message, partIndex);
}

function isLastTextPart(message: UIMessage, partIndex: number) {
    if (!message.parts) return true;
    for (let index = partIndex + 1; index < message.parts.length; index += 1) {
        const nextPart = message.parts[index];
        if (nextPart && nextPart.type === "text") return false;
    }
    return true;
}

function openMcpManager() {
    router.push("/mcp");
}

async function copyToClipboard(text: string) {
    if (!text) return;

    if (typeof navigator === "undefined" || !navigator.clipboard) return;

    try {
        await navigator.clipboard.writeText(text);
        ElMessage.success("内容已复制到剪贴板");
    } catch (error) {
        console.error("Failed to copy to clipboard", error);
    }
}

async function handleRegenerate() {
    chat.regenerate({
        body: {
            model: selectedModel.value?.id,
            mcpEnabled: hasEnabledServers.value,
        },
    });
}

function getModelSearchTerm(item: ModelInfo) {
    return [
        item.id,
        item.name,
        item.owned_by,
        item.description,
        item.type,
        ...(item.tags || []),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function isStreamingPart(msgIndex: number, partIndex: number) {
    const lastMsg = messages.value[messages.value.length - 1];
    const msg = messages.value[msgIndex];

    if (!lastMsg || msg.id !== lastMsg.id) return false;

    const isLastPart = partIndex === msg.parts.length - 1;
    return status.value === "streaming" && isLastPart;
}
function restoreToCheckpoint(messageIndex: number) {
    // Restore messages to checkpoint state (assuming setMessages API is the same)
    chat.sendMessage(messages.value.slice(0, messageIndex + 1) as any);
    // Remove checkpoints after this point
    checkpoints.value = checkpoints.value.filter(
        (cp) => cp.messageIndex <= messageIndex
    );
}

const tokenizer = TokenizerLoader.fromPreTrained({
    tokenizerConfig,
    tokenizerJSON,
});

const calculatedUsage = shallowRef({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
});

let usageTimer: number | null = null;
const recalcUsage = () => {
    // 流式期间 token 统计开销很大；结束时再算一次即可
    if (status.value === "streaming") return;

    let input = 0;
    let output = 0;
    for (const msg of messages.value || []) {
        const content =
            msg.parts
                ?.filter((p) => p.type === "text")
                .map((p) => (p as any).text)
                .join("\n") ||
            (msg as any).text ||
            "";

        const tokens = tokenizer.encode(content).length || 0;
        if (msg.role === "assistant") output += tokens;
        else input += tokens;
    }

    calculatedUsage.value = {
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
    };
};

const scheduleRecalcUsage = (delayMs = 300) => {
    if (usageTimer != null) window.clearTimeout(usageTimer);
    usageTimer = window.setTimeout(() => {
        usageTimer = null;
        recalcUsage();
    }, delayMs);
};

watch(
    () => status.value,
    (next, prev) => {
        if (prev === "streaming" && next !== "streaming") {
            if (usageTimer != null) {
                window.clearTimeout(usageTimer);
                usageTimer = null;
            }
            recalcUsage();
        }
    }
);

watch(
    () => messages.value.length,
    () => scheduleRecalcUsage(0)
);

const contextProps: any = computed(() => ({
    usedTokens: calculatedUsage.value.totalTokens,
    maxTokens: selectedModel.value?.context_window || 128000,
    modelId: selectedModel.value?.id || "openai:gpt-5",
    usage: calculatedUsage.value,
}));
</script>

<template>
    <div class="relative pl-5 pr-5 size-full h-screen p-6">
        <div class="flex h-full flex-col">
            <Conversation class="h-full">
                <ConversationContent>
                    <ConversationEmptyState v-if="messages.length === 0">
                        <div
                            class="flex flex-col items-center justify-center space-y-4"
                        >
                            <div class="bg-primary/10 p-6 rounded-full">
                                <Bot class="w-12 h-12 text-primary" />
                            </div>
                            <h1 class="text-2xl font-bold tracking-tight">
                                欢迎使用 Gloss Copilot
                            </h1>
                            <p
                                class="text-muted-foreground max-w-md text-center"
                            >
                                您的 AI 智能助手。开始一个新的对话吧。
                            </p>
                        </div>
                    </ConversationEmptyState>
                    <template
                        v-else
                        v-for="{
                            message,
                            index,
                            checkpoint,
                        } in messagesWithCheckpoints"
                        :key="message.id"
                    >
                        <Message :from="message.role">
                            <!-- 来源 -->
                            <Sources
                                v-if="
                                    message.role === 'assistant' &&
                                    getSourceUrlParts(message).length > 0
                                "
                            >
                                <SourcesTrigger
                                    :count="getSourceUrlParts(message).length"
                                />
                                <SourcesContent
                                    v-for="(source, index) in getSourceUrlParts(
                                        message
                                    )"
                                    :key="`${message.id}-source-${index}`"
                                >
                                    <Source
                                        :href="source.url"
                                        :title="source.title ?? source.url"
                                    />
                                </SourcesContent>
                            </Sources>

                            <!-- 内容 -->
                            <MessageContent>
                                <template
                                    v-for="(part, partIndex) in message.parts"
                                    :key="partIndex"
                                >
                                    <MessageResponse
                                        v-if="part.type === 'text'"
                                        :content="part.text"
                                        :is-streaming="
                                            isStreamingPart(index, partIndex)
                                        "
                                    />
                                    <Reasoning
                                        v-if="part.type === 'reasoning'"
                                        class="w-full"
                                        :is-streaming="
                                            isStreamingPart(index, partIndex)
                                        "
                                    >
                                        <ReasoningTrigger />
                                        <ReasoningContent
                                            :content="part.text"
                                        />
                                    </Reasoning>
                                    <Tool
                                        v-if="
                                            part.type === 'dynamic-tool' ||
                                            part.type.startsWith('tool-')
                                        "
                                    >
                                        <ToolHeader
                                            :state="(part as any).state"
                                            :title="part.type"
                                            :type="part.type as any"
                                        ></ToolHeader>
                                        <ToolContent>
                                            <ToolInput
                                                :input="(part as any).input"
                                            ></ToolInput>
                                            <ToolOutput
                                                :output="(part as any).output"
                                                :errorText="
                                                    (part as any).errorText
                                                "
                                            ></ToolOutput>
                                        </ToolContent>
                                    </Tool>

                                    <MessageActions
                                        v-if="
                                            shouldShowActions(
                                                message,
                                                partIndex
                                            ) && part.type === 'text'
                                        "
                                    >
                                        <MessageAction
                                            label="重试"
                                            @click="handleRegenerate"
                                        >
                                            <RefreshCcwIcon class="size-3" />
                                        </MessageAction>
                                        <MessageAction
                                            label="复制"
                                            @click="copyToClipboard(part.text)"
                                        >
                                            <CopyIcon class="size-3" />
                                        </MessageAction>
                                    </MessageActions>
                                </template>
                            </MessageContent>
                        </Message>
                        <Checkpoint v-if="checkpoint">
                            <CheckpointIcon />
                            <CheckpointTrigger
                                @click="
                                    restoreToCheckpoint(checkpoint.messageIndex)
                                "
                            >
                                Restore checkpoint
                            </CheckpointTrigger>
                        </Checkpoint>
                    </template>

                    <Loader v-if="status === 'submitted'" class="mx-auto" />
                </ConversationContent>

                <ConversationScrollButton />
            </Conversation>

            <div
                v-if="error"
                class="mx-auto mb-2 max-w-3xl rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive"
            >
                Error: {{ error.message }}
            </div>

            <PromptInput class="mb-8" global-drop multiple>
                <PromptInputHeader>
                    <PromptInputAttachments>
                        <template #default="{ file }">
                            <PromptInputAttachment :file="file" />
                        </template>
                    </PromptInputAttachments>
                </PromptInputHeader>

                <PromptInputBody>
                    <PromptInputTextarea />
                </PromptInputBody>

                <PromptInputFooter>
                    <PromptInputTools>
                        <PromptInputActionMenu>
                            <PromptInputActionMenuTrigger />
                            <PromptInputActionMenuContent>
                                <PromptInputActionAddAttachments />
                            </PromptInputActionMenuContent>
                        </PromptInputActionMenu>

                        <PromptInputSpeechButton />

                        <DropdownMenu>
                            <DropdownMenuTrigger as-child>
                                <PromptInputButton
                                    :variant="
                                        hasEnabledServers ? 'default' : 'ghost'
                                    "
                                    @contextmenu.prevent="openMcpManager"
                                >
                                    <Server class="size-4" />
                                    <span>MCP</span>
                                </PromptInputButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent class="w-56">
                                <DropdownMenuLabel
                                    >MCP 服务器</DropdownMenuLabel
                                >
                                <DropdownMenuSeparator />
                                <DropdownMenuSub
                                    v-for="server in servers"
                                    :key="server.id"
                                >
                                    <DropdownMenuSubTrigger>
                                        <div class="flex items-center gap-2">
                                            <div
                                                :class="
                                                    cn(
                                                        'w-2 h-2 rounded-full',
                                                        server.enabled
                                                            ? 'bg-green-500'
                                                            : 'bg-gray-300'
                                                    )
                                                "
                                            />
                                            <span>{{ server.name }}</span>
                                        </div>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent class="w-64">
                                        <DropdownMenuItem
                                            @click="
                                                toggleServer(
                                                    server.id,
                                                    !server.enabled
                                                )
                                            "
                                        >
                                            <Check
                                                v-if="server.enabled"
                                                class="mr-2 h-4 w-4"
                                            />
                                            <span v-else class="mr-6"></span>
                                            {{
                                                server.enabled
                                                    ? "已启用"
                                                    : "启用"
                                            }}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <div
                                            class="p-2 text-xs text-muted-foreground max-h-[300px] overflow-y-auto"
                                        >
                                            <div
                                                v-if="
                                                    mcpStore.serverCapabilities[
                                                        server.id
                                                    ]?.tools
                                                "
                                            >
                                                <div class="font-semibold mb-1">
                                                    工具 ({{
                                                        Object.keys(
                                                            mcpStore
                                                                .serverCapabilities[
                                                                server.id
                                                            ].tools
                                                        ).length
                                                    }})
                                                </div>
                                                <div class="pl-2 mb-2">
                                                    <div
                                                        v-for="name in Object.keys(
                                                            mcpStore
                                                                .serverCapabilities[
                                                                server.id
                                                            ].tools
                                                        )"
                                                        :key="String(name)"
                                                        class="truncate"
                                                        :title="String(name)"
                                                    >
                                                        - {{ name }}
                                                    </div>
                                                </div>
                                            </div>
                                            <div
                                                v-if="
                                                    mcpStore.serverCapabilities[
                                                        server.id
                                                    ]?.resources?.resources
                                                        ?.length
                                                "
                                            >
                                                <div class="font-semibold mb-1">
                                                    资源 ({{
                                                        mcpStore
                                                            .serverCapabilities[
                                                            server.id
                                                        ].resources.resources
                                                            .length
                                                    }})
                                                </div>
                                                <div class="pl-2 mb-2">
                                                    <div
                                                        v-for="resource in mcpStore
                                                            .serverCapabilities[
                                                            server.id
                                                        ].resources.resources"
                                                        :key="resource.uri"
                                                        class="truncate"
                                                        :title="resource.name"
                                                    >
                                                        - {{ resource.name }}
                                                    </div>
                                                </div>
                                            </div>
                                            <div
                                                v-if="
                                                    mcpStore.serverCapabilities[
                                                        server.id
                                                    ]?.prompts?.prompts?.length
                                                "
                                            >
                                                <div class="font-semibold mb-1">
                                                    提示词 ({{
                                                        mcpStore
                                                            .serverCapabilities[
                                                            server.id
                                                        ].prompts.prompts
                                                            .length
                                                    }})
                                                </div>
                                                <div class="pl-2 mb-2">
                                                    <div
                                                        v-for="prompt in mcpStore
                                                            .serverCapabilities[
                                                            server.id
                                                        ].prompts.prompts"
                                                        :key="prompt.name"
                                                        class="truncate"
                                                        :title="prompt.name"
                                                    >
                                                        - {{ prompt.name }}
                                                    </div>
                                                </div>
                                            </div>
                                            <div
                                                v-if="
                                                    !mcpStore
                                                        .serverCapabilities[
                                                        server.id
                                                    ]
                                                "
                                                class="text-center py-2"
                                            >
                                                无可用信息
                                            </div>
                                        </div>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem @click="openMcpManager">
                                    <Settings2 class="mr-2 h-4 w-4" />
                                    <span>管理服务器...</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <ModelSelector v-model:open="openModelSelector">
                            <ModelSelectorTrigger as-child>
                                <Button
                                    variant="ghost"
                                    role="combobox"
                                    :aria-expanded="openModelSelector"
                                    class="justify-between border-none bg-transparent font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground"
                                >
                                    <div
                                        class="flex items-center gap-2 truncate"
                                    >
                                        <ModelSelectorLogo
                                            v-if="selectedModelData?.owned_by"
                                            :provider="
                                                selectedModelData.owned_by
                                            "
                                        />
                                        <ModelSelectorName>
                                            {{
                                                selectedModelData
                                                    ? formatModelName(
                                                          selectedModelData.id
                                                      )
                                                    : "选择模型..."
                                            }}
                                        </ModelSelectorName>
                                    </div>
                                    <ChevronsUpDown
                                        class="ml-2 h-4 w-4 shrink-0 opacity-50"
                                    />
                                </Button>
                            </ModelSelectorTrigger>
                            <ModelSelectorContent>
                                <ModelSelectorInput placeholder="搜索模型..." />
                                <ModelSelectorList>
                                    <ModelSelectorEmpty
                                        >未找到模型。</ModelSelectorEmpty
                                    >
                                    <ModelSelectorGroup
                                        v-for="(
                                            groupModels, provider
                                        ) in groupedModels"
                                        :key="provider"
                                        :heading="provider"
                                    >
                                        <ModelSelectorItem
                                            v-for="item in groupModels"
                                            :key="item.id"
                                            :value="getModelSearchTerm(item)"
                                            class="flex items-start gap-2 py-3"
                                            @select="
                                                () => {
                                                    chatStore.selectModel(item);
                                                    openModelSelector = false;
                                                }
                                            "
                                        >
                                            <Check
                                                :class="
                                                    cn(
                                                        'mt-1 h-4 w-4 shrink-0',
                                                        selectedModel?.id ===
                                                            item.id
                                                            ? 'opacity-100'
                                                            : 'opacity-0'
                                                    )
                                                "
                                            />
                                            <div
                                                class="flex flex-col gap-1 w-full min-w-0"
                                            >
                                                <div
                                                    class="flex items-center justify-between gap-2"
                                                >
                                                    <div
                                                        class="flex items-center gap-2 truncate"
                                                    >
                                                        <ModelSelectorLogo
                                                            :provider="
                                                                item.owned_by
                                                            "
                                                        />
                                                        <ModelSelectorName
                                                            class="font-medium truncate"
                                                        >
                                                            {{
                                                                formatModelName(
                                                                    item.id
                                                                )
                                                            }}
                                                        </ModelSelectorName>
                                                    </div>
                                                    <span
                                                        class="text-[10px] uppercase text-muted-foreground border px-1 rounded"
                                                        >{{ item.type }}</span
                                                    >
                                                </div>

                                                <div
                                                    class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
                                                >
                                                    <span
                                                        v-if="
                                                            item.context_window
                                                        "
                                                        class="flex items-center gap-1"
                                                        title="上下文窗口"
                                                    >
                                                        <Maximize2
                                                            class="w-3 h-3"
                                                        />
                                                        {{
                                                            (
                                                                item.context_window /
                                                                1000
                                                            ).toFixed(0)
                                                        }}k
                                                    </span>
                                                    <span
                                                        v-if="item.max_tokens"
                                                        class="flex items-center gap-1"
                                                        title="最大输出 Token"
                                                    >
                                                        <MessageSquare
                                                            class="w-3 h-3"
                                                        />
                                                        {{
                                                            (
                                                                item.max_tokens /
                                                                1000
                                                            ).toFixed(0)
                                                        }}k
                                                    </span>
                                                </div>

                                                <div
                                                    v-if="item.pricing"
                                                    class="flex items-center gap-2 text-[10px] text-muted-foreground/80"
                                                >
                                                    <Coins class="w-3 h-3" />
                                                    <span
                                                        >输入:
                                                        {{
                                                            item.pricing.input
                                                        }}</span
                                                    >
                                                    <span
                                                        >输出:
                                                        {{
                                                            item.pricing.output
                                                        }}</span
                                                    >
                                                </div>

                                                <div
                                                    v-if="
                                                        item.tags &&
                                                        item.tags.length
                                                    "
                                                    class="flex flex-wrap gap-1 mt-1"
                                                >
                                                    <span
                                                        v-for="tag in item.tags"
                                                        :key="tag"
                                                        class="bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded text-[10px]"
                                                    >
                                                        {{ tag }}
                                                    </span>
                                                </div>
                                            </div>
                                        </ModelSelectorItem>
                                    </ModelSelectorGroup>
                                </ModelSelectorList>
                            </ModelSelectorContent>
                        </ModelSelector>
                        <Context v-bind="contextProps">
                            <ContextTrigger />

                            <ContextContent>
                                <ContextContentHeader />
                                <ContextContentBody>
                                    <ContextInputUsage />
                                    <ContextOutputUsage />
                                    <ContextReasoningUsage />
                                    <ContextCacheUsage />
                                </ContextContentBody>
                                <ContextContentFooter />
                            </ContextContent>
                        </Context>
                    </PromptInputTools>

                    <PromptInputSubmit
                        :disabled="submitDisabled"
                        :status="status"
                    />
                </PromptInputFooter>
            </PromptInput>
        </div>
    </div>
</template>
