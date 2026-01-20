<script setup lang="ts">
import {
    type ChatStatus,
    type LanguageModelUsage,
    type SourceUrlUIPart,
    type UIMessage,
} from "ai";
import type {
    AttachmentFile,
    PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { ChatUtils } from "@/utils/ChatUtils";
import type { StoredChatMessage } from "@/utils/interface";
import { Textarea } from "@/components/ui/textarea";
import { Image } from "@/components/ai-elements/image";

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
    Globe,
    Pencil,
    X,
    Loader2Icon,
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
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "vue-router";

import { createBuiltinTools } from "@/utils/BuiltinTools";

const props = withDefaults(
    defineProps<{
        /**
         * 后端接口路径：默认 /api/chat；任务模式传 /api/agent。
         */
        apiPath?: string;
    }>(),
    {
        apiPath: "/api/chat",
    },
);

// import { nanoid } from "nanoid";

const chatStore = useChatStore();
const {
    activeKey,
    conversations,
    selectedModel,
    availableModels,
    recentModelUsage,
} = storeToRefs(chatStore);
const settingsStore = useSettingsStore();
const mcpStore = useMcpStore();
const { servers } = storeToRefs(mcpStore);
const authStore = useAuthStore();
const router = useRouter();

const hasEnabledServers = computed(() => servers.value.some((s) => s.enabled));

const hasEnabledBuiltinTools = computed(() => {
    const t = settingsStore.builtinToolsEnabled;
    return Boolean(t?.filesystem || t?.git);
});

const hasEnabledAnyTools = computed(
    () => hasEnabledServers.value || hasEnabledBuiltinTools.value,
);

// WebSearch 开关（透传给后端）
const webSearchEnabled = computed(() => chatStore.webSearchEnabled);
async function toggleWebSearch() {
    await chatStore.setWebSearchEnabled(!webSearchEnabled.value);
}

// 跟踪是否已经为当前会话生成过总结标题
const hasGeneratedSummaryTitle = ref(false);

const mcpTogglingServerIds = ref<Set<string>>(new Set());

async function toggleServer(id: string, checked: boolean) {
    if (mcpTogglingServerIds.value.has(id)) return;
    mcpTogglingServerIds.value = new Set(mcpTogglingServerIds.value).add(id);
    try {
        await mcpStore.updateServer(id, { enabled: checked });
    } finally {
        const next = new Set(mcpTogglingServerIds.value);
        next.delete(id);
        mcpTogglingServerIds.value = next;
    }
}

const selectedModelType = ref<string>("all");
const selectedModelTags = ref<string[]>([]);
const selectedModelOwners = ref<string[]>([]);

const selectableModels = computed(() => {
    const all = availableModels.value || [];
    const selectedId = selectedModel.value?.id;
    return all.filter(
        (m) => !settingsStore.isModelHidden(m.id) || m.id === selectedId,
    );
});

const availableModelTypes = computed(() => {
    const types = new Set<string>();
    for (const m of selectableModels.value || []) {
        if (m?.type) types.add(m.type);
    }
    return Array.from(types).sort((a, b) => a.localeCompare(b));
});

const availableModelTags = computed(() => {
    const tags = new Set<string>();
    for (const m of selectableModels.value || []) {
        for (const t of m?.tags || []) {
            if (t) tags.add(t);
        }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
});

const availableModelOwners = computed(() => {
    const owners = new Set<string>();
    for (const m of selectableModels.value || []) {
        if (m?.owned_by) owners.add(m.owned_by);
    }
    return Array.from(owners).sort((a, b) => a.localeCompare(b));
});

function clearModelFilters() {
    selectedModelType.value = "all";
    selectedModelTags.value = [];
    selectedModelOwners.value = [];
}

function updateSelectedTag(tag: string, checked: boolean) {
    const next = new Set(selectedModelTags.value);
    if (checked) next.add(tag);
    else next.delete(tag);
    selectedModelTags.value = Array.from(next);
}

function updateSelectedOwner(owner: string, checked: boolean) {
    const next = new Set(selectedModelOwners.value);
    if (checked) next.add(owner);
    else next.delete(owner);
    selectedModelOwners.value = Array.from(next);
}

function matchesModelFilters(m: ModelInfo) {
    if (selectedModelType.value !== "all" && m.type !== selectedModelType.value)
        return false;
    if (selectedModelTags.value.length > 0) {
        const tags = m.tags || [];
        // 多选标签：采用“必须全部包含”的筛选语义
        if (!selectedModelTags.value.every((t) => tags.includes(t)))
            return false;
    }
    if (selectedModelOwners.value.length > 0) {
        // 多选开发商：采用“命中任意一个”的筛选语义
        if (!m.owned_by || !selectedModelOwners.value.includes(m.owned_by))
            return false;
    }
    return true;
}

const recentModels = computed(() => {
    const usage = recentModelUsage.value || {};
    return (selectableModels.value || [])
        .filter((m) => !!usage[m.id])
        .filter(matchesModelFilters)
        .sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0));
});

const recentModelIdSet = computed(
    () => new Set(recentModels.value.map((m) => m.id)),
);

const filteredModels = computed(() =>
    (selectableModels.value || [])
        .filter((m) => !recentModelIdSet.value.has(m.id))
        .filter(matchesModelFilters),
);

const groupedModels = computed(() =>
    groupModelsByProvider(filteredModels.value),
);
const selectedModelData = computed(() => selectedModel.value);
const selectedModelSearchTerm = computed(() =>
    selectedModel.value ? getModelSearchTerm(selectedModel.value) : "",
);
const openModelSelector = ref(false);

const checkpoints = ref<CheckpointType[]>([]);

onMounted(async () => {
    await mcpStore.init();
    mcpStore.checkConnections();
    if (!chatStore.recentModelUsageLoaded) {
        await chatStore.loadRecentModelUsage();
    }
    if (availableModels.value.length === 0) {
        await chatStore.loadAvailableModels();
    }
});

// 客户端可执行工具表（用于 onToolCall 执行并 addToolOutput 回填）
const clientToolsRef = shallowRef<Record<string, any> | null>(null);
const chat = ChatUtils.getChat({
    toolsRef: clientToolsRef,
    debugTools: false,
    apiPath: props.apiPath,
});

const status = computed<ChatStatus>(() => chat.status);
const messages = computed<UIMessage[]>(() => chat.messages);
const error = computed(() => chat.error);

// 为每条消息记录“首次出现时间”（按会话隔离），避免延迟 sync 导致时间戳不准确
const messageTimestamps = shallowRef<Map<string, number>>(new Map());
const messageTimestampKey = (conversationId: string, messageId: string) =>
    `${conversationId}::${messageId}`;
const getOrSetMessageTimestamp = (
    conversationId: string,
    messageId: string,
    fallbackTimestamp?: number,
) => {
    const key = messageTimestampKey(conversationId, messageId);
    const existing = messageTimestamps.value.get(key);
    if (typeof existing === "number" && Number.isFinite(existing)) {
        return existing;
    }
    const next =
        typeof fallbackTimestamp === "number" &&
        Number.isFinite(fallbackTimestamp)
            ? fallbackTimestamp
            : Date.now();
    messageTimestamps.value.set(key, next);
    return next;
};

const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
        d.getDate(),
    )} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

const getMessageTimestampText = (messageId: string) => {
    const conversationId = activeKey.value;
    if (!conversationId || !messageId) return "";
    const key = messageTimestampKey(conversationId, messageId);
    const ts = messageTimestamps.value.get(key);
    if (typeof ts !== "number" || !Number.isFinite(ts)) return "";
    return formatTimestamp(ts);
};

// Prevent duplicate sends caused by rapid consecutive submits before `chat.status` updates.
const sendLock = ref(false);
const isChatBusy = computed(
    () =>
        sendLock.value ||
        status.value === "submitted" ||
        status.value === "streaming",
);

watch(
    () => status.value,
    (next) => {
        if (next !== "submitted" && next !== "streaming") {
            sendLock.value = false;
        }
    },
);

// ===== 用户消息编辑 / 重新发送 =====
const editingUserMessageId = ref<string | null>(null);
const editingUserMessageText = ref<string>("");

function getUserMessageText(message: UIMessage): string {
    return (
        message.parts
            ?.filter((p: any) => p?.type === "text")
            .map((p: any) => p.text ?? "")
            .join("\n") ?? ""
    );
}

function getMessageFileParts(message: UIMessage): any[] {
    return (message.parts ?? []).filter((p: any) => p?.type === "file");
}

function asAttachmentFile(
    part: any,
    messageId: string,
    index: number,
): AttachmentFile {
    const id = part?.id ?? `${messageId}-file-${index}`;
    const filename = part?.filename ?? part?.name;

    return {
        ...part,
        id,
        type: "file",
        filename,
    } as AttachmentFile;
}

function replaceTextParts(parts: any[], nextText: string): any[] {
    const result: any[] = [];
    let replaced = false;
    for (const part of parts ?? []) {
        if (part?.type === "text") {
            if (!replaced) {
                result.push({ ...part, text: nextText });
                replaced = true;
            }
            continue;
        }
        result.push(part);
    }
    if (!replaced) {
        result.unshift({ type: "text", text: nextText });
    }
    return result;
}

async function sendChatMessage(
    text: string,
    messageId?: string,
    files?: any[],
) {
    if (isChatBusy.value) return;

    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后使用会话");
        void authStore.startLogin();
        return;
    }

    sendLock.value = true;
    const mcpTools = await mcpStore.getCachedTools();
    const builtinTools = createBuiltinTools({
        enabled: settingsStore.builtinToolsEnabled,
        // 若用户没有配置 allowedDirectories，则工具本身会拒绝执行。
        allowedDirectories: settingsStore.allowedDirectories,
        cwd: settingsStore.allowedDirectories?.[0] || null,
    });
    const tools = {
        ...(mcpTools || {}),
        ...(builtinTools || {}),
    };
    clientToolsRef.value = tools;
    const toolsEnabled = Object.keys(tools).length > 0;

    try {
        await chat.sendMessage(
            { text, messageId, files },
            {
                body: {
                    model: selectedModel.value?.id,
                    // 后端若仅在 mcpEnabled=true 时启用 tools，这里扩展为“任意工具可用”。
                    mcpEnabled: toolsEnabled,
                    tools,
                    ...(webSearchEnabled.value ? { webSearch: true } : {}),
                },
            },
        );
    } finally {
        if (status.value !== "submitted" && status.value !== "streaming") {
            sendLock.value = false;
        }
    }
}

function truncateChatToMessage(messageId: string, updatedText?: string) {
    const current = chat.messages;
    const index = current.findIndex((m) => m.id === messageId);
    if (index < 0) return false;

    const prefix = current.slice(0, index + 1);
    const target = prefix[index];
    if (updatedText != null) {
        prefix[index] = {
            ...target,
            parts: replaceTextParts(target.parts as any, updatedText),
        } as any;
    }
    chat.messages = prefix as any;
    return true;
}

function startEditUserMessage(message: UIMessage) {
    if (status.value === "streaming" || status.value === "submitted") return;
    editingUserMessageId.value = message.id;
    editingUserMessageText.value = getUserMessageText(message);
}

function cancelEditUserMessage() {
    editingUserMessageId.value = null;
    editingUserMessageText.value = "";
}

async function resendUserMessage(message: UIMessage) {
    if (status.value === "streaming" || status.value === "submitted") return;

    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后使用会话");
        void authStore.startLogin();
        return;
    }

    const text = getUserMessageText(message);
    const files = message.parts.filter((part) => part.type === "file") as any[];
    if (!truncateChatToMessage(message.id)) return;
    await sendChatMessage(text, message.id, files);
}

async function confirmEditAndResendUserMessage() {
    if (status.value === "streaming" || status.value === "submitted") return;

    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后使用会话");
        void authStore.startLogin();
        return;
    }

    const nextText = editingUserMessageText.value.trim();
    const messageId = editingUserMessageId.value;
    if (!messageId || !nextText) return;

    // 获取原始消息的文件信息
    const originalMessage = messages.value.find((m) => m.id === messageId);
    const files = originalMessage
        ? (originalMessage.parts.filter(
              (part) => part.type === "file",
          ) as any[])
        : [];

    if (!truncateChatToMessage(messageId, nextText)) return;
    cancelEditUserMessage();
    await sendChatMessage(nextText, messageId, files);
}

watch(error, (newError) => {
    if (newError) {
        console.error("Chat error:", newError);
    }
});

function syncChatToStoreFor(conversationId: string) {
    const conversation = conversations.value[conversationId];
    if (!conversation) return;

    const oldMessagesMap = new Map(conversation.messages.map((m) => [m.id, m]));

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
            timestamp: getOrSetMessageTimestamp(
                conversationId,
                m.id,
                old?.timestamp,
            ),
            parts: m.parts,
            reasoning: old?.reasoning,
        };
    });

    conversation.messages = updatedMessages;
    const lastMessageTimestamp =
        updatedMessages.length > 0
            ? updatedMessages[updatedMessages.length - 1].timestamp
            : Date.now();
    conversation.updatedAt = lastMessageTimestamp;

    const item = chatStore.conversationsItems.find(
        (it) => it.key === conversationId,
    );
    if (item) {
        item.timestamp = lastMessageTimestamp;
        item.messageCount = updatedMessages.length;
    }

    chatStore.markPendingChanges(conversationId);
    chatStore.debouncedSave();
}

function applyConversationToChat(conversationId: string) {
    const conversation = conversations.value[conversationId];
    // 回填历史消息的时间戳缓存（确保每条都能拿到独立时间）
    for (const m of conversation?.messages || []) {
        getOrSetMessageTimestamp(conversationId, m.id, m.timestamp);
    }
    chat.messages = conversation
        ? conversation.messages.map((m) => ({
              id: m.id,
              role: m.role === "data" ? "assistant" : m.role,
              parts:
                  Array.isArray(m.parts) && m.parts.length > 0
                      ? (m.parts as any)
                      : ([{ type: "text", text: m.content ?? "" }] as any),
          }))
        : [];
}

// Sync from Store to Chat (switch conversation)
watch(
    activeKey,
    (newKey, oldKey) => {
        // 切换会话前，先把当前 UI 中的消息写回旧会话，避免覆盖/丢失
        if (oldKey && oldKey !== newKey) {
            if (syncTimer != null) {
                window.clearTimeout(syncTimer);
                syncTimer = null;
            }
            // 流式时不强行同步，避免把半截内容写进 store
            if (status.value !== "streaming") {
                syncChatToStoreFor(oldKey);
            }
        }

        if (!newKey) {
            chat.messages = [];
            hasGeneratedSummaryTitle.value = false;
            return;
        }

        void (async () => {
            await chatStore.ensureConversationLoaded(newKey);
            applyConversationToChat(newKey);

            // 切换会话时重置总结标题生成标志
            hasGeneratedSummaryTitle.value = false;
        })();
    },
    { immediate: true },
);

let syncTimer: number | null = null;
const syncChatToStore = () => {
    if (!activeKey.value) return;
    syncChatToStoreFor(activeKey.value);
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
        // 为当前会话中新出现的消息记录时间戳
        if (activeKey.value) {
            for (const m of messages.value) {
                getOrSetMessageTimestamp(activeKey.value, m.id);
            }
        }
        // 新消息进入（用户/助手占位）时，非流式情况下可以同步一次
        scheduleSyncChatToStore(0);
    },
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

            // AI回复完成后，如果是首次且未生成总结标题，则生成总结标题
            if (next === "ready" && !hasGeneratedSummaryTitle.value) {
                const conversation = conversations.value[activeKey.value];
                if (
                    conversation &&
                    conversation.messages.some((m) => m.role === "assistant")
                ) {
                    console.log(next);

                    hasGeneratedSummaryTitle.value = true;
                    chatStore.generateSummaryTitle(activeKey.value);
                }
            }
        }
    },
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
            (cp) => cp.messageIndex === index,
        );
        return { message, index, checkpoint };
    });
});

async function handleSubmit(message: PromptInputMessage) {
    const hasText = Boolean(message.text?.trim());
    const hasAttachments = Boolean(message.files?.length);

    if (!hasText && !hasAttachments) return;
    if (isChatBusy.value) return;

    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后使用会话");
        void authStore.startLogin();
        return;
    }

    try {
        sendLock.value = true;
        // Use cached tools to avoid reloading on each message
        const tools = await mcpStore.getCachedTools();

        // 供客户端 onToolCall 使用：真正执行工具并回填 output
        clientToolsRef.value = tools;

        const p = chat.sendMessage(
            {
                text: hasText ? message.text : "已发送附件",
                files: hasAttachments ? message.files : [],
            },
            {
                body: {
                    model: selectedModel.value?.id,
                    mcpEnabled: hasEnabledServers.value,
                    tools,
                    ...(webSearchEnabled.value ? { webSearch: true } : {}),
                },
            },
        );

        p.catch((error) => {
            console.error("Failed to send message", error);
            sendLock.value = false;
        });
    } catch (error) {
        console.error("Failed to send message", error);
        sendLock.value = false;
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

const submitDisabled = computed(
    () =>
        !hasPendingInput.value ||
        isChatBusy.value ||
        promptInput.isLoading.value ||
        !authStore.isLoggedIn,
);

function getSourceUrlParts(message: UIMessage) {
    return (
        message.parts?.filter(
            (part): part is SourceUrlUIPart => part.type === "source-url",
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
    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后使用会话");
        void authStore.startLogin();
        return;
    }
    const mcpTools = await mcpStore.getCachedTools();
    const builtinTools = createBuiltinTools({
        enabled: settingsStore.builtinToolsEnabled,
        allowedDirectories: settingsStore.allowedDirectories,
        cwd: settingsStore.allowedDirectories?.[0] || null,
    });
    const tools = {
        ...(mcpTools || {}),
        ...(builtinTools || {}),
    };
    clientToolsRef.value = tools;
    const toolsEnabled = Object.keys(tools).length > 0;
    chat.regenerate({
        body: {
            model: selectedModel.value?.id,
            mcpEnabled: toolsEnabled,
            tools,
            ...(webSearchEnabled.value ? { webSearch: true } : {}),
        },
    });
}

async function handleStop() {
    await chat.stop();
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
        (cp) => cp.messageIndex <= messageIndex,
    );
}

const tokenizer = TokenizerLoader.fromPreTrained({
    tokenizerConfig,
    tokenizerJSON,
});

// 将任意附件按“二进制大小”估算 token（避免把 base64 直接塞进 tokenizer）
// 经验值：1 token ~ 4 bytes（仅用于前端展示的粗略估算）
const BYTES_PER_TOKEN = 4;
const attachmentByteSizeCache = shallowRef<Map<string, number>>(new Map());
const attachmentByteSizeInFlight = shallowRef<Set<string>>(new Set());

function attachmentCacheKey(messageId: string, part: any, index: number) {
    const partId = part?.id ?? part?.url ?? part?.filename ?? part?.name;
    const raw = String(partId ?? index);
    const safe = raw.length > 200 ? raw.slice(0, 200) : raw;
    return `${messageId}::${safe}`;
}

function estimateTokensFromBytes(bytes: number) {
    const safe = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
    return Math.ceil(safe / BYTES_PER_TOKEN);
}

function dataUrlByteSize(dataUrl: string): number | null {
    if (!dataUrl.startsWith("data:")) return null;
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;

    const meta = dataUrl.slice(0, comma);
    const payload = dataUrl.slice(comma + 1);

    try {
        if (meta.includes(";base64")) {
            // base64 bytes ≈ (len * 3 / 4) - padding
            const padding = payload.endsWith("==")
                ? 2
                : payload.endsWith("=")
                  ? 1
                  : 0;
            return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
        }
        // 非 base64：按 URL 编码文本解码后再测 UTF-8 字节数
        const decoded = decodeURIComponent(payload);
        return new TextEncoder().encode(decoded).length;
    } catch {
        return null;
    }
}

async function fetchUrlByteSize(url: string): Promise<number | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const len = res.headers.get("content-length");
        if (len && /^\d+$/.test(len)) return Number(len);
        const blob = await res.blob();
        return blob.size;
    } catch {
        return null;
    }
}

function getMessageText(msg: UIMessage): string {
    return (
        msg.parts
            ?.filter((p) => p.type === "text")
            .map((p) => (p as any).text)
            .join("\n") ||
        (msg as any).text ||
        ""
    );
}

function getKnownAttachmentByteSize(part: any): number | null {
    if (typeof part?.file?.size === "number") return part.file.size;
    if (typeof part?.size === "number") return part.size;
    const url = typeof part?.url === "string" ? part.url : "";
    if (url.startsWith("data:")) return dataUrlByteSize(url);
    return null;
}

function getOrScheduleAttachmentByteSize(
    messageId: string,
    part: any,
    index: number,
): number | null {
    const key = attachmentCacheKey(messageId, part, index);
    const cached = attachmentByteSizeCache.value.get(key);
    if (typeof cached === "number") return cached;

    const known = getKnownAttachmentByteSize(part);
    if (typeof known === "number") {
        const next = new Map(attachmentByteSizeCache.value);
        next.set(key, known);
        attachmentByteSizeCache.value = next;
        return known;
    }

    const url = typeof part?.url === "string" ? part.url : "";
    const shouldFetch =
        url.startsWith("blob:") ||
        url.startsWith("http:") ||
        url.startsWith("https:");
    if (!shouldFetch) return null;

    if (attachmentByteSizeInFlight.value.has(key)) return null;
    const nextInFlight = new Set(attachmentByteSizeInFlight.value);
    nextInFlight.add(key);
    attachmentByteSizeInFlight.value = nextInFlight;

    void (async () => {
        try {
            const size = await fetchUrlByteSize(url);
            if (typeof size === "number") {
                const nextCache = new Map(attachmentByteSizeCache.value);
                nextCache.set(key, size);
                attachmentByteSizeCache.value = nextCache;
            }
        } finally {
            const nextSet = new Set(attachmentByteSizeInFlight.value);
            nextSet.delete(key);
            attachmentByteSizeInFlight.value = nextSet;
            if (status.value !== "streaming") scheduleRecalcUsage(0);
        }
    })();

    return null;
}

const calculatedUsage = shallowRef({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
});

const contextMaxTokens = computed(
    () => selectedModelData.value?.context_window ?? 0,
);

const contextUsage = computed<LanguageModelUsage>(() => {
    return {
        inputTokens: calculatedUsage.value.inputTokens,
        outputTokens: calculatedUsage.value.outputTokens,
        totalTokens: calculatedUsage.value.totalTokens,
    } as any;
});

let usageTimer: number | null = null;
const recalcUsage = () => {
    // 流式期间 token 统计开销很大；结束时再算一次即可
    if (status.value === "streaming") return;

    let input = 0;
    let output = 0;
    for (const msg of messages.value || []) {
        const text = getMessageText(msg);
        const textTokens = tokenizer.encode(text).length || 0;

        let binaryTokens = 0;
        const fileParts = getMessageFileParts(msg);
        for (let index = 0; index < fileParts.length; index += 1) {
            const part = fileParts[index];
            const bytes = getOrScheduleAttachmentByteSize(msg.id, part, index);
            if (typeof bytes === "number") {
                binaryTokens += estimateTokensFromBytes(bytes);
            }
        }

        const tokens = textTokens + binaryTokens;
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

const imageData = (part: any): any => {
    console.log(part);

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
    },
);

watch(
    () => messages.value.length,
    () => scheduleRecalcUsage(0),
);
</script>

<template>
    <div class="relative pl-5 pr-5 size-full h-full">
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
                                欢迎使用 Glosc Copilot
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
                                        message,
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
                                <div
                                    v-if="
                                        message.role === 'user' &&
                                        getMessageFileParts(message).length > 0
                                    "
                                    class="flex flex-wrap items-center gap-2 p-3 w-full"
                                >
                                    <PromptInputAttachment
                                        v-for="(
                                            filePart, fileIndex
                                        ) in getMessageFileParts(message)"
                                        :key="
                                            filePart.id ||
                                            `${message.id}-file-${fileIndex}`
                                        "
                                        :file="
                                            asAttachmentFile(
                                                filePart,
                                                message.id,
                                                fileIndex,
                                            )
                                        "
                                        readonly
                                    />
                                </div>

                                <template
                                    v-for="(part, partIndex) in message.parts"
                                    :key="partIndex"
                                >
                                    <template v-if="part.type === 'text'">
                                        <template
                                            v-if="
                                                message.role === 'user' &&
                                                editingUserMessageId ===
                                                    message.id &&
                                                isLastTextPart(
                                                    message,
                                                    partIndex,
                                                )
                                            "
                                        >
                                            <Textarea
                                                v-model="editingUserMessageText"
                                                class="min-h-20"
                                            />
                                        </template>
                                        <template v-else>
                                            <MessageResponse
                                                :id="`${message.id}-text-${partIndex}`"
                                                :content="part.text"
                                                :is-streaming="
                                                    isStreamingPart(
                                                        index,
                                                        partIndex,
                                                    )
                                                "
                                            />
                                        </template>
                                    </template>
                                    <Reasoning
                                        v-if="part.type === 'reasoning'"
                                        class="w-full"
                                        :is-streaming="
                                            isStreamingPart(index, partIndex)
                                        "
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
                                                    part.type !==
                                                        'tool-sequentialthinking' &&
                                                    !isFileToolType(part.type)
                                                "
                                                :input="(part as any).input"
                                            ></ToolInput>
                                            <SequentialThinking
                                                v-if="
                                                    part.type ===
                                                    'tool-sequentialthinking'
                                                "
                                                :input="(part as any).input"
                                                :output="(part as any).output"
                                                :errorText="
                                                    (part as any).errorText
                                                "
                                            />
                                            <EditText
                                                v-else-if="
                                                    isFileToolType(part.type)
                                                "
                                                :toolType="part.type"
                                                :input="(part as any).input"
                                                :output="(part as any).output"
                                                :errorText="
                                                    (part as any).errorText
                                                "
                                            />
                                            <ToolOutput
                                                v-else
                                                :output="(part as any).output"
                                                :errorText="
                                                    (part as any).errorText
                                                "
                                            ></ToolOutput>
                                        </ToolContent>
                                    </Tool>
                                    <Image
                                        v-if="
                                            part.type === 'file' &&
                                            part.mediaType.startsWith(
                                                'image/',
                                            ) &&
                                            message.role === 'assistant'
                                        "
                                        v-bind="imageData(part)"
                                        class="max-w-[90%] h-auto rounded-md"
                                        :alt="
                                            (part as any).alt ||
                                            'Generated image'
                                        "
                                    />

                                    <MessageActions
                                        v-if="
                                            shouldShowActions(
                                                message,
                                                partIndex,
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
                                        <span
                                            v-if="
                                                getMessageTimestampText(
                                                    message.id,
                                                )
                                            "
                                            class="ml-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity select-none"
                                        >
                                            {{
                                                getMessageTimestampText(
                                                    message.id,
                                                )
                                            }}
                                        </span>
                                    </MessageActions>

                                    <MessageActions
                                        v-if="
                                            message.role === 'user' &&
                                            part.type === 'text' &&
                                            isLastTextPart(message, partIndex)
                                        "
                                    >
                                        <template
                                            v-if="
                                                editingUserMessageId ===
                                                message.id
                                            "
                                        >
                                            <MessageAction
                                                label="取消"
                                                @click="cancelEditUserMessage"
                                            />
                                            <MessageAction
                                                label="发送"
                                                @click="
                                                    confirmEditAndResendUserMessage()
                                                "
                                            >
                                                <RefreshCcwIcon
                                                    class="size-3"
                                                />
                                            </MessageAction>
                                        </template>
                                        <template v-else>
                                            <MessageAction
                                                label="编辑"
                                                @click="
                                                    startEditUserMessage(
                                                        message,
                                                    )
                                                "
                                            >
                                                <Pencil class="size-3" />
                                            </MessageAction>
                                            <MessageAction
                                                label="重新发送"
                                                @click="
                                                    resendUserMessage(message)
                                                "
                                            >
                                                <RefreshCcwIcon
                                                    class="size-3"
                                                />
                                            </MessageAction>
                                        </template>

                                        <span
                                            v-if="
                                                getMessageTimestampText(
                                                    message.id,
                                                )
                                            "
                                            class="ml-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity select-none"
                                        >
                                            {{
                                                getMessageTimestampText(
                                                    message.id,
                                                )
                                            }}
                                        </span>
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

            <div
                v-if="!authStore.isLoggedIn"
                class="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-3 rounded-md bg-secondary/40 px-4 py-2 text-sm"
            >
                <div class="text-muted-foreground">
                    请先登录后使用会话（消息会以你的账号身份请求 API）
                </div>
                <Button size="sm" @click="authStore.startLogin()">
                    去登录
                </Button>
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

                        <Context
                            :used-tokens="calculatedUsage.totalTokens"
                            :max-tokens="contextMaxTokens"
                            :usage="contextUsage"
                            :model-id="selectedModelData?.id"
                        >
                            <ContextTrigger />
                            <ContextContent class="w-72">
                                <ContextContentHeader />
                                <ContextContentBody class="space-y-2">
                                    <ContextInputUsage />
                                    <ContextOutputUsage />
                                    <ContextReasoningUsage />
                                    <ContextCacheUsage />
                                </ContextContentBody>
                                <ContextContentFooter />
                            </ContextContent>
                        </Context>

                        <PromptInputButton
                            :variant="webSearchEnabled ? 'default' : 'ghost'"
                            title="联网搜索"
                            @click="toggleWebSearch"
                        >
                            <Globe class="size-4" />
                            <span>联网搜索</span>
                        </PromptInputButton>

                        <DropdownMenu>
                            <DropdownMenuTrigger as-child>
                                <PromptInputButton
                                    :variant="
                                        hasEnabledAnyTools ? 'default' : 'ghost'
                                    "
                                    @contextmenu.prevent="openMcpManager"
                                >
                                    <Server class="size-4" />
                                    <span>工具</span>
                                </PromptInputButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent class="w-56">
                                <DropdownMenuLabel>工具</DropdownMenuLabel>
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
                                                            : 'bg-gray-300',
                                                    )
                                                "
                                            />
                                            <span>{{ server.name }}</span>
                                        </div>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent class="w-64">
                                        <DropdownMenuItem
                                            :disabled="
                                                mcpTogglingServerIds.has(
                                                    server.id,
                                                )
                                            "
                                            @click="
                                                toggleServer(
                                                    server.id,
                                                    !server.enabled,
                                                )
                                            "
                                        >
                                            <Loader2Icon
                                                v-if="
                                                    mcpTogglingServerIds.has(
                                                        server.id,
                                                    )
                                                "
                                                class="mr-2 h-4 w-4 animate-spin"
                                            />
                                            <Check
                                                v-else-if="server.enabled"
                                                class="mr-2 h-4 w-4"
                                            />
                                            <span v-else class="mr-6"></span>
                                            <span
                                                v-if="
                                                    mcpTogglingServerIds.has(
                                                        server.id,
                                                    )
                                                "
                                            >
                                                {{
                                                    server.enabled
                                                        ? "禁用中"
                                                        : "启用中"
                                                }}
                                            </span>
                                            <span v-else>
                                                {{
                                                    server.enabled
                                                        ? "已启用"
                                                        : "启用"
                                                }}
                                            </span>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <div
                                            class="p-2 text-xs text-muted-foreground max-h-75 overflow-y-auto"
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
                                                            ].tools,
                                                        ).length
                                                    }})
                                                </div>
                                                <div class="pl-2 mb-2">
                                                    <div
                                                        v-for="name in Object.keys(
                                                            mcpStore
                                                                .serverCapabilities[
                                                                server.id
                                                            ].tools,
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
                                    <span>管理工具...</span>
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
                                                          selectedModelData.id,
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
                            <ModelSelectorContent
                                :model-value="selectedModelSearchTerm"
                            >
                                <ModelSelectorInput placeholder="搜索模型..." />

                                <div
                                    class="px-3 pb-2 flex items-center gap-2 flex-wrap"
                                >
                                    <Select v-model="selectedModelType">
                                        <SelectTrigger class="h-8 w-40">
                                            <SelectValue placeholder="类型" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">
                                                全部类型
                                            </SelectItem>
                                            <SelectItem
                                                v-for="t in availableModelTypes"
                                                :key="t"
                                                :value="t"
                                            >
                                                {{ t }}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger as-child>
                                            <Button
                                                variant="outline"
                                                class="h-8"
                                            >
                                                标签
                                                <span
                                                    v-if="
                                                        selectedModelTags.length
                                                    "
                                                    class="ml-1 text-muted-foreground"
                                                >
                                                    ({{
                                                        selectedModelTags.length
                                                    }})
                                                </span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            class="w-64 max-h-72 overflow-auto"
                                        >
                                            <DropdownMenuLabel>
                                                标签筛选
                                            </DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuCheckboxItem
                                                v-for="tag in availableModelTags"
                                                :key="tag"
                                                :checked="
                                                    selectedModelTags.includes(
                                                        tag,
                                                    )
                                                "
                                                @select.prevent="
                                                    updateSelectedTag(
                                                        tag,
                                                        !selectedModelTags.includes(
                                                            tag,
                                                        ),
                                                    )
                                                "
                                                :class="{
                                                    'bg-blue-500!':
                                                        selectedModelTags.includes(
                                                            tag,
                                                        ),
                                                }"
                                            >
                                                {{ tag }}
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                :disabled="
                                                    selectedModelTags.length ===
                                                    0
                                                "
                                                @click="selectedModelTags = []"
                                            >
                                                清空标签
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger as-child>
                                            <Button
                                                variant="outline"
                                                class="h-8"
                                            >
                                                开发商
                                                <span
                                                    v-if="
                                                        selectedModelOwners.length
                                                    "
                                                    class="ml-1 text-muted-foreground"
                                                >
                                                    ({{
                                                        selectedModelOwners.length
                                                    }})
                                                </span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            class="w-64 max-h-72 overflow-auto"
                                        >
                                            <DropdownMenuLabel>
                                                开发商筛选 (owned_by)
                                            </DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuCheckboxItem
                                                v-for="owner in availableModelOwners"
                                                :key="owner"
                                                :checked="
                                                    selectedModelOwners.includes(
                                                        owner,
                                                    )
                                                "
                                                @select.prevent="
                                                    updateSelectedOwner(
                                                        owner,
                                                        !selectedModelOwners.includes(
                                                            owner,
                                                        ),
                                                    )
                                                "
                                                :class="{
                                                    'bg-blue-500!':
                                                        selectedModelOwners.includes(
                                                            owner,
                                                        ),
                                                }"
                                            >
                                                {{ owner }}
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                :disabled="
                                                    selectedModelOwners.length ===
                                                    0
                                                "
                                                @click="
                                                    selectedModelOwners = []
                                                "
                                            >
                                                清空开发商
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    <Button
                                        v-if="
                                            selectedModelType !== 'all' ||
                                            selectedModelTags.length ||
                                            selectedModelOwners.length
                                        "
                                        variant="ghost"
                                        class="h-8 px-2"
                                        @click="clearModelFilters"
                                    >
                                        清除
                                    </Button>
                                </div>

                                <ModelSelectorList>
                                    <ModelSelectorEmpty
                                        >未找到模型。</ModelSelectorEmpty
                                    >

                                    <ModelSelectorGroup
                                        v-if="recentModels.length"
                                        heading="最近使用"
                                    >
                                        <ModelSelectorItem
                                            v-for="item in recentModels"
                                            :key="item.id"
                                            :value="getModelSearchTerm(item)"
                                            :class="
                                                cn(
                                                    'flex items-start gap-2 py-3',
                                                    selectedModel?.id ===
                                                        item.id
                                                        ? 'bg-accent text-accent-foreground'
                                                        : '',
                                                )
                                            "
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
                                                            : 'opacity-0',
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
                                                                    item.id,
                                                                )
                                                            }}
                                                        </ModelSelectorName>
                                                    </div>
                                                    <div
                                                        class="flex items-center gap-1"
                                                    >
                                                        <span
                                                            class="text-[10px] uppercase text-muted-foreground border px-1 rounded"
                                                            >{{
                                                                item.type
                                                            }}</span
                                                        >
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            class="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                                                            @click.stop="
                                                                chatStore.removeRecentModel(
                                                                    item.id,
                                                                )
                                                            "
                                                        >
                                                            <X
                                                                class="h-3 w-3"
                                                            />
                                                        </Button>
                                                    </div>
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
                                            :class="
                                                cn(
                                                    'flex items-start gap-2 py-3',
                                                    selectedModel?.id ===
                                                        item.id
                                                        ? 'bg-accent text-accent-foreground'
                                                        : '',
                                                )
                                            "
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
                                                            : 'opacity-0',
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
                                                                    item.id,
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
                    </PromptInputTools>

                    <PromptInputSubmit
                        v-if="status !== 'streaming' && status !== 'submitted'"
                        :disabled="submitDisabled"
                        :status="status"
                    />
                    <PromptInputSubmit
                        v-else
                        :disabled="false"
                        :status="status"
                        @click="handleStop"
                        type="button"
                    />
                </PromptInputFooter>
            </PromptInput>
        </div>
    </div>
</template>
