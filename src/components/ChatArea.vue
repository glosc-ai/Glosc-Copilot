<script setup lang="ts">
import {
    DefaultChatTransport,
    type ChatStatus,
    type SourceUrlUIPart,
    type UIMessage,
} from "ai";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Chat } from "@ai-sdk/vue";
import {
    CopyIcon,
    GlobeIcon,
    RefreshCcwIcon,
    Check,
    ChevronsUpDown,
    Bot,
} from "lucide-vue-next";
import {
    fetchAvailableModels,
    formatModelName,
    groupModelsByProvider,
} from "@/utils/ModelApi";

import { cn } from "@/lib/utils";

const availableModels = ref<ModelInfo[]>([]);
const groupedModels = computed(() =>
    groupModelsByProvider(availableModels.value)
);
const model = ref("");
const webSearch = ref(false);
const openModelSelector = ref(false);

onMounted(async () => {
    try {
        const fetchedModels = await fetchAvailableModels();
        availableModels.value = fetchedModels;
        if (fetchedModels.length > 0) {
            model.value = fetchedModels[0].id;
        }
    } catch (e) {
        console.error("Failed to fetch models", e);
    }
});

const chat = new Chat({
    transport: new DefaultChatTransport({
        api: "http://localhost:3000/api/chat",
    }),
});

const status = computed<ChatStatus>(() => chat.status);
const messages = computed(() => chat.messages);
const lastMessageId = computed(
    () => messages.value[messages.value.length - 1]?.id ?? null
);
const lastAssistantMessageId = computed(() => {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
        const current = messages.value[index];
        if (current && current.role === "assistant") return current.id;
    }
    return null;
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
                    model: model.value,
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

function isReasoningStreaming(message: UIMessage, partIndex: number) {
    return (
        status.value === "streaming" &&
        message.id === lastMessageId.value &&
        message.parts &&
        partIndex === message.parts.length - 1
    );
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
            model: model.value,
            webSearch: webSearch.value,
        },
    });
}
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
                                Welcome to Gloss Copilot
                            </h1>
                            <p
                                class="text-muted-foreground max-w-md text-center"
                            >
                                Your AI-powered assistant. Start a conversation
                                to begin.
                            </p>
                        </div>
                    </ConversationEmptyState>
                    <template v-else>
                        <div v-for="message in messages" :key="message.id">
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

                            <template
                                v-for="(part, partIndex) in message.parts"
                                :key="`${message.id}-${partIndex}`"
                            >
                                <Message
                                    v-if="part.type === 'text'"
                                    :from="message.role"
                                >
                                    <div>
                                        <MessageContent>
                                            <MessageResponse
                                                :content="part.text"
                                            />
                                        </MessageContent>

                                        <MessageActions
                                            v-if="
                                                shouldShowActions(
                                                    message,
                                                    partIndex
                                                )
                                            "
                                        >
                                            <MessageAction
                                                label="Retry"
                                                @click="handleRegenerate"
                                            >
                                                <RefreshCcwIcon
                                                    class="size-3"
                                                />
                                            </MessageAction>
                                            <MessageAction
                                                label="Copy"
                                                @click="
                                                    copyToClipboard(part.text)
                                                "
                                            >
                                                <CopyIcon class="size-3" />
                                            </MessageAction>
                                        </MessageActions>
                                    </div>
                                </Message>

                                <Reasoning
                                    v-else-if="part.type === 'reasoning'"
                                    class="w-full"
                                    :is-streaming="
                                        isReasoningStreaming(message, partIndex)
                                    "
                                >
                                    <ReasoningTrigger />
                                    <ReasoningContent :content="part.text" />
                                </Reasoning>
                            </template>
                        </div>
                    </template>

                    <Loader v-if="status === 'submitted'" class="mx-auto" />
                </ConversationContent>

                <ConversationScrollButton />
            </Conversation>

            <PromptInput class="mt-4" global-drop multiple>
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

                        <PromptInputButton
                            :variant="webSearch ? 'default' : 'ghost'"
                            @click="toggleWebSearch"
                        >
                            <GlobeIcon class="size-4" />
                            <span>Search</span>
                        </PromptInputButton>

                        <Popover v-model:open="openModelSelector">
                            <PopoverTrigger as-child>
                                <Button
                                    variant="ghost"
                                    role="combobox"
                                    :aria-expanded="openModelSelector"
                                    class="justify-between border-none bg-transparent font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground"
                                >
                                    {{
                                        model
                                            ? formatModelName(model)
                                            : "Select model..."
                                    }}
                                    <ChevronsUpDown
                                        class="ml-2 h-4 w-4 shrink-0 opacity-50"
                                    />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent class="w-[200px] p-0">
                                <Command>
                                    <CommandInput
                                        placeholder="Search model..."
                                    />
                                    <CommandEmpty>No model found.</CommandEmpty>
                                    <CommandList>
                                        <CommandGroup
                                            v-for="(
                                                groupModels, provider
                                            ) in groupedModels"
                                            :key="provider"
                                            :heading="provider"
                                        >
                                            <CommandItem
                                                v-for="item in groupModels"
                                                :key="item.id"
                                                :value="item.id"
                                                @select="
                                                    () => {
                                                        model = item.id;
                                                        openModelSelector = false;
                                                    }
                                                "
                                            >
                                                <Check
                                                    :class="
                                                        cn(
                                                            'mr-2 h-4 w-4',
                                                            model === item.id
                                                                ? 'opacity-100'
                                                                : 'opacity-0'
                                                        )
                                                    "
                                                />
                                                {{ formatModelName(item.id) }}
                                            </CommandItem>
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
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
