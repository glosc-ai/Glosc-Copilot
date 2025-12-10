<script setup lang="ts">
import { type ChatStatus, type SourceUrlUIPart, type UIMessage } from "ai";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ChatUtils } from "@/utils/ChatUtils";
import ToolInvocation from "@/components/ai-elements/tool/ToolInvocation.vue";
import {
    CopyIcon,
    GlobeIcon,
    RefreshCcwIcon,
    Check,
    ChevronsUpDown,
    Bot,
    Maximize2,
    MessageSquare,
    Coins,
} from "lucide-vue-next";
import {
    fetchAvailableModels,
    formatModelName,
    groupModelsByProvider,
} from "@/utils/ModelApi";
// import { countTokens } from "tokenlens";
import {
    tokenizerJSON,
    tokenizerConfig,
} from "@lenml/tokenizer-claude/src/data.ts";

import { TokenizerLoader, tokenizers } from "@lenml/tokenizers";

import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat";
import { storeToRefs } from "pinia";

const chatStore = useChatStore();
const { activeKey, conversations } = storeToRefs(chatStore);

const availableModels = ref<ModelInfo[]>([]);
const groupedModels = computed(() =>
    groupModelsByProvider(availableModels.value)
);
const model = ref<ModelInfo | null>(null);
const selectedModelData = computed(() => model.value);
const webSearch = ref(false);
const openModelSelector = ref(false);

const checkpoints = ref<CheckpointType[]>([]);

onMounted(async () => {
    try {
        const fetchedModels = await fetchAvailableModels();
        availableModels.value = fetchedModels;
        if (fetchedModels.length > 0) {
            const defaultModelId = "xai/grok-code-fast-1";
            const defaultModel = fetchedModels.find(
                (m) => m.id === defaultModelId
            );
            model.value = defaultModel || fetchedModels[0] || null;
        }
    } catch (e) {
        console.error("Failed to fetch models", e);
    }
});

const chat = ChatUtils.chat;

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
watch(
    messages,
    (newMessages) => {
        if (!activeKey.value || !conversations.value[activeKey.value]) return;

        const currentConversation = conversations.value[activeKey.value];
        const oldMessagesMap = new Map(
            currentConversation.messages.map((m) => [m.id, m])
        );

        const updatedMessages: StoredChatMessage[] = newMessages.map((m) => {
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
    },
    { deep: true }
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
        await chat.sendMessage(
            {
                text: hasText ? message.text : "Sent with attachments",
            },
            {
                body: {
                    model: model.value?.id,
                    webSearch: webSearch.value,
                },
            }
        );
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

function toggleWebSearch() {
    webSearch.value = !webSearch.value;
}

async function copyToClipboard(text: string) {
    if (!text) return;

    if (typeof navigator === "undefined" || !navigator.clipboard) return;

    try {
        await navigator.clipboard.writeText(text);
    } catch (error) {
        console.error("Failed to copy to clipboard", error);
    }
}

function handleRegenerate() {
    chat.regenerate({
        body: {
            model: model.value?.id,
            webSearch: webSearch.value,
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

const calculatedUsage = computed(() => {
    let input = 0;
    let output = 0;

    if (!messages.value)
        return {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cachedInputTokens: 0,
            reasoningTokens: 0,
            inputTokenDetails: [],
            outputTokenDetails: [],
        };

    for (const msg of messages.value) {
        const content =
            msg.parts
                ?.filter((p) => p.type === "text")
                .map((p) => (p as any).text)
                .join("\n") ||
            (msg as any).text ||
            "";

        const tokenizer = TokenizerLoader.fromPreTrained({
            tokenizerConfig,
            tokenizerJSON,
        });

        // const tokenizer =  tokenizers.AutoTokenizer.from_pretrained(
        //     model.value?.id || "gpt-4"
        // );

        const tokens = tokenizer.encode(content).length || 0;
        if (msg.role === "assistant") {
            output += tokens;
        } else {
            input += tokens;
        }
    }

    return {
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
    };
});

const contextProps: any = computed(() => ({
    usedTokens: calculatedUsage.value.totalTokens,
    maxTokens: model.value?.context_window || 128000,
    modelId: model.value?.id || "openai:gpt-5",
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
                                    <ToolInvocation
                                        v-if="part.type === 'tool-invocation'"
                                        :tool-invocation="part"
                                    />

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

                        <PromptInputButton
                            :variant="webSearch ? 'default' : 'ghost'"
                            @click="toggleWebSearch"
                        >
                            <GlobeIcon class="size-4" />
                            <span>联网搜索</span>
                        </PromptInputButton>

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
                                                    model = item;
                                                    openModelSelector = false;
                                                }
                                            "
                                        >
                                            <Check
                                                :class="
                                                    cn(
                                                        'mt-1 h-4 w-4 shrink-0',
                                                        model?.id === item.id
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
