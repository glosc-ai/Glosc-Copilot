<script setup lang="ts">
import type { ChatStatus, SourceUrlUIPart, UIMessage } from "ai";
import type { AttachmentFile } from "@/components/ai-elements/prompt-input";
import { CopyIcon, RefreshCcwIcon } from "lucide-vue-next";

const props = withDefaults(
    defineProps<{
        message: UIMessage;
        messageIndex: number;
        status: ChatStatus;
        lastMessageId: string | null;
        lastAssistantMessageId?: string | null;
        sources?: SourceUrlUIPart[];
        getTimestampText?: (messageId: string) => string;
    }>(),
    {
        lastAssistantMessageId: null,
        sources: () => [],
        getTimestampText: undefined,
    },
);

const emit = defineEmits<{
    (e: "regenerate"): void;
    (e: "copy", text: string): void;
}>();

const messageFileParts = computed(() =>
    (props.message.parts ?? []).filter((p: any) => p?.type === "file"),
);

function asAttachmentFile(
    part: any,
    messageId: string,
    index: number,
): AttachmentFile {
    const id = part?.id ?? `${messageId}-file-${index}`;
    const filename = part?.filename ?? part?.name;

    return {
        type: "file",
        id,
        filename,
        mediaType: part?.mediaType,
        size: part?.size,
        url: part?.url,
    } as AttachmentFile;
}

function isLastTextPart(partIndex: number) {
    const parts: any[] = (props.message.parts as any[]) ?? [];
    for (let index = partIndex + 1; index < parts.length; index += 1) {
        const nextPart = parts[index];
        if (nextPart && nextPart.type === "text") return false;
    }
    return true;
}

function shouldShowAssistantActions(partIndex: number) {
    if (props.message.role !== "assistant") return false;
    if (!props.lastAssistantMessageId) return false;
    if (props.lastAssistantMessageId !== props.message.id) return false;
    return isLastTextPart(partIndex);
}

function isStreamingPart(partIndex: number) {
    if (props.status !== "streaming") return false;
    if (!props.lastMessageId || props.lastMessageId !== props.message.id)
        return false;
    const parts: any[] = (props.message.parts as any[]) ?? [];
    if (parts.length === 0) return partIndex === 0;
    return partIndex === parts.length - 1;
}

const imageData = (part: any): any => {
    return {
        base64: part.url,
        mediaType: part.mediaType,
        uint8Array: new Uint8Array([]),
    };
};

const fileToolTypes = new Set([
    "tool-editText",
    "tool-read_file",
    "tool-read_text_file",
    "tool-read_media_file",
    "tool-read_multiple_files",
    "tool-write_file",
    "tool-edit_file",
    "tool-create_directory",
    "tool-list_directory",
    "tool-list_directory_with_sizes",
    "tool-directory_tree",
    "tool-move_file",
    "tool-search_files",
    "tool-get_file_info",
    "tool-list_allowed_directories",
]);

function isFileToolType(type: string) {
    return fileToolTypes.has(type);
}

const timestampTextForMessage = computed(() =>
    typeof props.getTimestampText === "function"
        ? props.getTimestampText(props.message.id)
        : "",
);
</script>

<template>
    <Message :from="message.role">
        <!-- 来源 -->
        <Sources v-if="message.role === 'assistant' && sources?.length">
            <SourcesTrigger :count="sources.length" />
            <SourcesContent
                v-for="(source, index) in sources"
                :key="`${message.id}-source-${index}`"
            >
                <Source
                    :href="source.url"
                    :title="source.title ?? source.url"
                />
            </SourcesContent>
        </Sources>

        <MessageContent>
            <!-- 用户文件附件 -->
            <div
                v-if="message.role === 'user' && messageFileParts.length > 0"
                class="flex flex-wrap items-center gap-2 p-3 w-full"
            >
                <PromptInputAttachment
                    v-for="(filePart, fileIndex) in messageFileParts"
                    :key="
                        (filePart as any).id ||
                        `${message.id}-file-${fileIndex}`
                    "
                    :file="asAttachmentFile(filePart, message.id, fileIndex)"
                    readonly
                />
            </div>

            <template
                v-for="(part, partIndex) in message.parts"
                :key="partIndex"
            >
                <template v-if="part.type === 'text'">
                    <slot
                        name="text"
                        :message="message"
                        :part="part"
                        :partIndex="partIndex"
                        :isLastTextPart="isLastTextPart(partIndex)"
                        :isStreaming="isStreamingPart(partIndex)"
                    >
                        <Shimmer
                            v-if="isStreamingPart(partIndex) && !part.text"
                            class="text-sm text-muted-foreground"
                            >正在生成回复...</Shimmer
                        >
                        <MessageResponse
                            v-else
                            :id="`${message.id}-text-${partIndex}`"
                            :content="part.text"
                            :is-streaming="isStreamingPart(partIndex)"
                        />
                    </slot>
                </template>

                <Reasoning
                    v-if="part.type === 'reasoning'"
                    class="w-full"
                    :is-streaming="isStreamingPart(partIndex)"
                >
                    <ReasoningTrigger />
                    <ReasoningContent
                        :id="`${message.id}-reasoning-${partIndex}`"
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
                            v-if="
                                part.type !== 'tool-sequentialthinking' &&
                                !isFileToolType(part.type)
                            "
                            :input="(part as any).input"
                        ></ToolInput>
                        <SequentialThinkingQueue
                            v-if="part.type === 'tool-sequentialthinking'"
                            :input="(part as any).input"
                            :output="(part as any).output"
                            :errorText="(part as any).errorText"
                        />
                        <EditText
                            v-else-if="isFileToolType(part.type)"
                            :toolType="part.type"
                            :input="(part as any).input"
                            :output="(part as any).output"
                            :errorText="(part as any).errorText"
                        />
                        <ToolOutput
                            v-else
                            :output="(part as any).output"
                            :errorText="(part as any).errorText"
                        ></ToolOutput>
                    </ToolContent>
                </Tool>

                <Image
                    v-if="
                        part.type === 'file' &&
                        part.mediaType.startsWith('image/') &&
                        message.role === 'assistant'
                    "
                    v-bind="imageData(part)"
                    class="max-w-[90%] h-auto rounded-md"
                    :alt="(part as any).alt || 'Generated image'"
                />

                <!-- 助手消息动作（默认：重试/复制 + 时间戳） -->
                <template
                    v-if="
                        part.type === 'text' &&
                        shouldShowAssistantActions(partIndex)
                    "
                >
                    <slot
                        name="assistant-actions"
                        :message="message"
                        :part="part"
                        :partIndex="partIndex"
                        :timestampText="timestampTextForMessage"
                    >
                        <MessageActions>
                            <MessageAction
                                label="重试"
                                @click="emit('regenerate')"
                            >
                                <RefreshCcwIcon class="size-3" />
                            </MessageAction>
                            <MessageAction
                                label="复制"
                                @click="emit('copy', part.text)"
                            >
                                <CopyIcon class="size-3" />
                            </MessageAction>
                            <span
                                v-if="timestampTextForMessage"
                                class="ml-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity select-none"
                            >
                                {{ timestampTextForMessage }}
                            </span>
                        </MessageActions>
                    </slot>
                </template>

                <!-- 用户消息动作（由上层决定） -->
                <template
                    v-if="
                        message.role === 'user' &&
                        part.type === 'text' &&
                        isLastTextPart(partIndex)
                    "
                >
                    <slot
                        name="user-actions"
                        :message="message"
                        :part="part"
                        :partIndex="partIndex"
                        :timestampText="timestampTextForMessage"
                    />
                </template>
            </template>
        </MessageContent>
    </Message>
</template>
