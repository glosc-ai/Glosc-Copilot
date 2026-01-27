<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ModelSelectorPicker from "@/components/ModelSelectorPicker.vue";
import ChatMessageItem from "@/components/chat/ChatMessageItem.vue";

import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";

import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
    PromptInput,
    PromptInputHeader,
    PromptInputAttachments,
    PromptInputAttachment,
    PromptInputBody,
    PromptInputTextarea,
    PromptInputFooter,
    PromptInputTools,
    PromptInputActionMenu,
    PromptInputActionMenuTrigger,
    PromptInputActionMenuContent,
    PromptInputActionAddAttachments,
    PromptInputSubmit,
    type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

import { useWorkspaceChatStore } from "@/stores/workspaceChat";
import { useMcpStore } from "@/stores/mcp";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";

import { ChatUtils } from "@/utils/ChatUtils";
import { McpUtils } from "@/utils/McpUtils";
import { parseCustomModelId } from "@/utils/CustomModelId";
// import { createBuiltinTools } from "@/utils/BuiltinTools";

import { readDir, readTextFile } from "@tauri-apps/plugin-fs";

import type { ChatStatus, SourceUrlUIPart, UIMessage } from "ai";

import {
    Check,
    ChevronDown,
    Pencil,
    Plus,
    RefreshCcwIcon,
    Settings2,
    Trash2,
} from "lucide-vue-next";

import McpPromptInputInsert from "@/components/mcp/McpPromptInputInsert.vue";
import { InlineCitedText } from "@/components/ai-elements/inline-citation";
import PromptInputResourceCitationsPreview from "@/components/ai-elements/prompt-input/PromptInputResourceCitationsPreview.vue";

const props = defineProps<{ workspaceRoot: string | null }>();

const chatStore = useWorkspaceChatStore();
const settingsStore = useSettingsStore();
const mcpStore = useMcpStore();
const authStore = useAuthStore();

const {
    conversationsItems,
    conversations,
    activeKey,
    availableModels,
    selectedModel,
} = storeToRefs(chatStore);

const selectedConversation = computed(() =>
    activeKey.value ? conversations.value[activeKey.value] : null,
);

const activeSessionLabel = computed(() => {
    const key = activeKey.value;
    if (!key) return "未选择";
    const hit = (conversationsItems.value || []).find((it) => it.key === key);
    return hit?.label || "未命名会话";
});

const clientToolsRef = shallowRef<Record<string, any> | null>(null);
const chat = ChatUtils.getChat({
    apiPath: "/api/chat",
    toolsRef: clientToolsRef,
    debugTools: false,
});

const status = computed<ChatStatus>(() => chat.status);
const rawMessages = computed<UIMessage[]>(() => chat.messages);
const error = computed(() => (chat as any).error);

// UI 里隐藏 system 消息，但发送给后端时依然保留
const visibleMessages = computed(() =>
    (rawMessages.value || []).filter((m) => m.role !== "system"),
);

const lastVisibleMessageId = computed(() =>
    visibleMessages.value.length
        ? visibleMessages.value[visibleMessages.value.length - 1]?.id
        : null,
);

const lastVisibleAssistantMessageId = computed(() => {
    for (let index = visibleMessages.value.length - 1; index >= 0; index -= 1) {
        const m = visibleMessages.value[index];
        if (m?.role === "assistant") return m.id;
    }
    return null;
});

function getSourceUrlParts(message: UIMessage) {
    return (
        message.parts?.filter(
            (part): part is SourceUrlUIPart => part.type === "source-url",
        ) ?? []
    );
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
    const conv = selectedConversation.value;
    if (!conv) return;

    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后使用工作区会话");
        void authStore.startLogin();
        return;
    }

    await ensureSystemPromptUpToDate();

    const enabledIds = new Set(conv.enabledMcpServerIds || []);
    const toolServers = (mcpStore.servers || []).map((s: any) => ({
        ...s,
        enabled: enabledIds.has(s.id),
    }));

    const mcpTools = await McpUtils.getTools(toolServers as any, {
        skipStopDisabled: true,
    });

    // const builtinEnabled = {
    //     filesystem: Boolean(conv.enabledBuiltinTools?.filesystem),
    //     git: Boolean(conv.enabledBuiltinTools?.git),
    // };
    // const allowedDirectories = conv.workspaceRoot ? [conv.workspaceRoot] : [];
    // const builtinTools = createBuiltinTools({
    //     // enabled: builtinEnabled,
    //     allowedDirectories,
    //     cwd: conv.workspaceRoot || null,
    // });

    const tools = { ...mcpTools };
    clientToolsRef.value = tools;

    const modelId = conv.modelId || selectedModel.value?.id;

    const parsedCustom = parseCustomModelId(modelId);
    const customProvider = parsedCustom
        ? settingsStore.getCustomModelProviderById(parsedCustom.providerId)
        : null;
    if (parsedCustom && !customProvider) {
        ElMessage.error("自定义模型配置不存在或已被删除，请在设置中重新配置。");
        return;
    }

    chat.regenerate({
        body: {
            model: parsedCustom ? parsedCustom.rawModelId : modelId,
            ...(parsedCustom && customProvider
                ? {
                      useUserKey: true,
                      userModelProviderId: customProvider.id,
                      userModelProvider: "openai-compatible",
                      userModelGroupName: customProvider.name,
                      userModelApiKey: customProvider.apiKey,
                      userModelBaseUrl: customProvider.baseUrl,
                  }
                : {}),
            // 兼容后端：只要启用了任意 tools，就把开关打开
            mcpEnabled: Object.keys(tools).length > 0,
            tools,
            ...(conv.webSearch ? { webSearch: true } : {}),
        },
    });
}

const isChatBusy = computed(
    () => status.value === "submitted" || status.value === "streaming",
);

// ===== 用户消息编辑 / 重新发送（工作区会话） =====
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

function truncateChatToMessage(messageId: string, updatedText?: string) {
    const current = chat.messages as any[];
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

async function sendChatMessage(
    text: string,
    messageId?: string,
    files?: any[],
) {
    const conv = selectedConversation.value;
    if (!conv) return;

    if (isChatBusy.value) return;

    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后使用工作区会话");
        void authStore.startLogin();
        return;
    }

    await ensureSystemPromptUpToDate();

    const enabledIds = new Set(conv.enabledMcpServerIds || []);
    const toolServers = (mcpStore.servers || []).map((s: any) => ({
        ...s,
        enabled: enabledIds.has(s.id),
    }));

    const mcpTools = await McpUtils.getTools(toolServers as any, {
        skipStopDisabled: true,
    });

    // const builtinEnabled = {
    //     filesystem: Boolean(conv.enabledBuiltinTools?.filesystem),
    //     git: Boolean(conv.enabledBuiltinTools?.git),
    // };
    // const allowedDirectories = conv.workspaceRoot ? [conv.workspaceRoot] : [];
    // const builtinTools = createBuiltinTools({
    //     // enabled: builtinEnabled,
    //     allowedDirectories,
    //     cwd: conv.workspaceRoot || null,
    // });

    const tools = { ...mcpTools };
    clientToolsRef.value = tools;

    const modelId = conv.modelId || selectedModel.value?.id;

    const parsedCustom = parseCustomModelId(modelId);
    const customProvider = parsedCustom
        ? settingsStore.getCustomModelProviderById(parsedCustom.providerId)
        : null;
    if (parsedCustom && !customProvider) {
        ElMessage.error("自定义模型配置不存在或已被删除，请在设置中重新配置。");
        return;
    }

    try {
        await chat.sendMessage(
            { text, messageId, files },
            {
                body: {
                    model: parsedCustom ? parsedCustom.rawModelId : modelId,
                    ...(parsedCustom && customProvider
                        ? {
                              useUserKey: true,
                              userModelProviderId: customProvider.id,
                              userModelProvider: "openai-compatible",
                              userModelGroupName: customProvider.name,
                              userModelApiKey: customProvider.apiKey,
                              userModelBaseUrl: customProvider.baseUrl,
                          }
                        : {}),
                    mcpEnabled: Object.keys(tools).length > 0,
                    tools,
                    ...(conv.webSearch ? { webSearch: true } : {}),
                },
            },
        );
    } catch (e) {
        const errorText =
            ChatUtils.extractStreamErrorText(e) ||
            (e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "流式传输发生错误");
        if (String(errorText || "").trim()) {
            ElMessage.error(String(errorText).trim());
        }
        try {
            void (chat as any).stop?.();
        } catch {
            // ignore
        }
        throw e;
    }
}

watch(error, (newError) => {
    if (!newError) return;

    const errorText =
        ChatUtils.extractStreamErrorText(newError) ||
        (newError instanceof Error
            ? newError.message
            : typeof newError === "string"
              ? newError
              : "流式传输发生错误");

    const trimmed = String(errorText || "").trim();
    if (trimmed) {
        try {
            ElMessage.error(trimmed);
        } catch {
            // ignore
        }

        // 追加到最后一条 assistant 消息，便于用户在对话里看到原因
        try {
            const current = ((chat as any).messages as any[]) || [];
            for (let i = current.length - 1; i >= 0; i -= 1) {
                const m: any = current[i];
                if (m?.role !== "assistant") continue;

                const parts: any[] = Array.isArray(m.parts)
                    ? [...m.parts]
                    : [{ type: "text", text: m.content ?? "" }];

                let lastTextIndex = -1;
                for (let j = parts.length - 1; j >= 0; j -= 1) {
                    if (parts[j]?.type === "text") {
                        lastTextIndex = j;
                        break;
                    }
                }

                const errorLine = `（错误：${trimmed}）`;
                if (lastTextIndex < 0) {
                    parts.push({ type: "text", text: errorLine });
                } else {
                    const prevText = String(parts[lastTextIndex]?.text ?? "");
                    if (!prevText.includes(trimmed)) {
                        const nextText = prevText
                            ? `${prevText}\n\n${errorLine}`
                            : errorLine;
                        parts[lastTextIndex] = {
                            ...parts[lastTextIndex],
                            text: nextText,
                        };
                    }
                }

                const nextMessages = current.slice();
                nextMessages[i] = { ...m, parts };
                (chat as any).messages = nextMessages as any;
                break;
            }
        } catch {
            // ignore
        }
    }

    if (status.value === "submitted" || status.value === "streaming") {
        try {
            void (chat as any).stop?.();
        } catch {
            // ignore
        }
    }
});

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
        ElMessage.warning("请先登录后使用工作区会话");
        void authStore.startLogin();
        return;
    }

    const text = getUserMessageText(message);
    const files = (message.parts || []).filter(
        (part: any) => part.type === "file",
    ) as any[];
    if (!truncateChatToMessage(message.id)) return;
    await sendChatMessage(text, message.id, files);
}

async function confirmEditAndResendUserMessage() {
    if (status.value === "streaming" || status.value === "submitted") return;

    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后使用工作区会话");
        void authStore.startLogin();
        return;
    }

    const nextText = editingUserMessageText.value.trim();
    const messageId = editingUserMessageId.value;
    if (!messageId || !nextText) return;

    const originalMessage = rawMessages.value.find((m) => m.id === messageId);
    const files = originalMessage
        ? ((originalMessage.parts || []).filter(
              (part: any) => part.type === "file",
          ) as any[])
        : [];

    if (!truncateChatToMessage(messageId, nextText)) return;
    cancelEditUserMessage();
    await sendChatMessage(nextText, messageId, files);
}

const settingsOpen = ref(false);

const enabledToolCount = computed(() => {
    const conv = selectedConversation.value;
    const mcpCount = (conv?.enabledMcpServerIds || []).length;
    // const builtinCount =
    //     (conv?.enabledBuiltinTools?.filesystem ? 1 : 0) +
    //     (conv?.enabledBuiltinTools?.git ? 1 : 0);
    return mcpCount;
});

const activeModelLabel = computed(() => {
    const conv = selectedConversation.value;
    const modelId = conv?.modelId || selectedModel.value?.id;
    if (!modelId) return "未选择";
    const hit = (availableModels.value || []).find((m) => m.id === modelId);
    return hit?.name || modelId;
});

const selectedConversationModelId = computed(
    () => selectedConversation.value?.modelId || selectedModel.value?.id || "",
);

const selectedConversationModelInfo = computed(() => {
    const modelId = selectedConversationModelId.value;
    if (!modelId) return null;
    return (availableModels.value || []).find((m) => m.id === modelId) || null;
});

// ========== workspace root 绑定 ==========
async function ensureActiveSession() {
    if (!props.workspaceRoot) return;

    // 如果没有活动会话
    if (!chatStore.activeKey) {
        if (chatStore.conversationsItems.length > 0) {
            // 如果有历史会话，自动选择最近的一个（第一个）
            const first = chatStore.conversationsItems[0];
            await chatStore.selectConversation(first.key);
        } else {
            // 如果没有任何会话，自动新建
            await createNewSession();
        }
    } else {
        // 确保选中的会话被加载
        await chatStore.selectConversation(chatStore.activeKey);
    }
}

onMounted(async () => {
    await mcpStore.init();
    void mcpStore.checkConnections();
    await chatStore.setWorkspaceRoot(props.workspaceRoot);
    await ensureActiveSession();
});

watch(
    () => props.workspaceRoot,
    async (next) => {
        await chatStore.setWorkspaceRoot(next);
        await ensureActiveSession();
    },
);

// ========== 会话切换：store -> chat.messages ==========
function asUiMessage(m: any): UIMessage {
    return {
        id: m.id,
        role: m.role,
        parts:
            Array.isArray(m.parts) && m.parts.length > 0
                ? m.parts
                : [{ type: "text", text: m.content ?? "" }],
    } as any;
}

function buildBaseWorkspaceSystemPrompt(params: {
    workspaceRoot: string;
    customInstructions?: string;
    agentSkillsEnabled?: boolean;
    fileContextText?: string;
}) {
    const lines: string[] = [];

    lines.push("你是一个在『工作区』内协助用户的 AI 助手。\n");

    lines.push("【工作区约束】");
    lines.push(`- 当前工作区目录：${params.workspaceRoot}`);
    lines.push(
        "- 不要操作工作区以外的文件；不要读取/写入/执行工作区外路径。\n",
    );

    lines.push("【文件上下文】");
    lines.push(
        params.fileContextText
            ? params.fileContextText
            : "- 默认不注入全量文件；如用户要求再提供。",
    );
    lines.push("");

    if (params.agentSkillsEnabled !== false) {
        lines.push("【Agent Skills（适配）】");
        lines.push("- 先澄清目标与约束，再制定简短计划。");
        lines.push(
            "- 需要读取信息时，优先使用工具/文件读取获得事实，而不是猜测。",
        );
        lines.push(
            "- 修改文件时尽量小步、可验证；完成后说明改动点与验证方式。",
        );
        lines.push(
            "- 任何可能越界（工作区外文件、危险命令、不可逆操作）必须先征得用户确认。\n",
        );
    }

    if (params.customInstructions?.trim()) {
        lines.push("【用户自定义指令】");
        lines.push(params.customInstructions.trim());
        lines.push("");
    }

    return lines.join("\n").trim();
}

function applyConversationToChat(conversationId: string) {
    const conv = conversations.value[conversationId];
    if (!conv) {
        chat.messages = [] as any;
        return;
    }

    // system prompt 作为第一条 system 消息
    const systemId = `ws-system-${conversationId}`;
    const systemText = buildBaseWorkspaceSystemPrompt({
        workspaceRoot: conv.workspaceRoot,
        customInstructions: conv.customInstructions,
        agentSkillsEnabled: conv.agentSkillsEnabled,
        fileContextText: undefined,
    });

    const systemMessage: any = {
        id: systemId,
        role: "system",
        parts: [{ type: "text", text: systemText }],
    };

    const uiMessages: UIMessage[] = [systemMessage as any].concat(
        (conv.messages || [])
            .filter((m) => m.role !== "system")
            .map((m) => asUiMessage(m)),
    );

    chat.messages = uiMessages as any;
}

watch(
    () => activeKey.value,
    async (next) => {
        cancelEditUserMessage();
        if (!next) {
            chat.messages = [] as any;
            return;
        }
        await chatStore.ensureConversationLoaded(next);
        applyConversationToChat(next);
    },
    { immediate: true },
);

// ========== workspace 文件上下文（可选注入） ==========
function shouldSkipDir(name: string) {
    return [".git", "node_modules", "dist", "build", "target"].includes(name);
}

async function listWorkspaceFiles(root: string, maxFiles = 800, maxDepth = 12) {
    const results: string[] = [];

    async function walk(dir: string, depth: number) {
        if (depth > maxDepth) return;
        if (results.length >= maxFiles) return;

        const entries = await readDir(dir);
        for (const e of entries as any[]) {
            if (results.length >= maxFiles) return;
            const name = e?.name ?? "";
            const path = e?.path ?? "";
            const isDir = Boolean(e?.isDir ?? e?.isDirectory);
            if (!name || !path) continue;
            if (isDir) {
                if (shouldSkipDir(name)) continue;
                await walk(path, depth + 1);
            } else {
                results.push(path);
            }
        }
    }

    await walk(root, 0);
    return results;
}

function toRelPath(root: string, fullPath: string) {
    const r = root.replace(/\\/g, "/");
    const p = fullPath.replace(/\\/g, "/");
    if (p === r) return ".";
    if (p.startsWith(r + "/")) return p.slice(r.length + 1);
    return p;
}

function isProbablyTextFile(path: string) {
    const lower = (path || "").toLowerCase();
    // 简单白名单，避免把二进制塞进 prompt
    if (
        /[.](png|jpg|jpeg|gif|webp|ico|mp3|mp4|mov|mkv|zip|7z|rar|pdf|exe|dll)$/.test(
            lower,
        )
    ) {
        return false;
    }
    return true;
}

async function buildWorkspaceFileContext(root: string, mode: string) {
    if (mode === "none") return "";

    const files = await listWorkspaceFiles(root);
    const rel = files.map((p) => toRelPath(root, p));

    if (mode === "list") {
        return ["- 工作区文件列表（部分，已截断）:", "```", ...rel, "```"].join(
            "\n",
        );
    }

    // contents
    const maxTotalChars = 60_000;
    const maxPerFileChars = 6_000;
    let used = 0;
    const blocks: string[] = [];

    for (const full of files) {
        if (used >= maxTotalChars) break;
        if (!isProbablyTextFile(full)) continue;
        try {
            const content = await readTextFile(full);
            const snippet = (content || "").slice(0, maxPerFileChars);
            const block = [
                `\n# ${toRelPath(root, full)}`,
                "```",
                snippet,
                snippet.length < (content || "").length
                    ? "\n...（已截断）"
                    : "",
                "```",
            ].join("\n");
            blocks.push(block);
            used += block.length;
        } catch {
            // ignore unreadable files
        }
    }

    if (blocks.length === 0) {
        return "- 未能读取到可用的文本文件内容。";
    }

    return ["- 工作区文件内容（部分，已截断）:", ...blocks].join("\n");
}

async function ensureSystemPromptUpToDate() {
    const conv = selectedConversation.value;
    if (!conv) return;

    const root = conv.workspaceRoot;
    const fileContextText = await buildWorkspaceFileContext(
        root,
        conv.fileContextMode || "none",
    );

    const systemText = buildBaseWorkspaceSystemPrompt({
        workspaceRoot: root,
        customInstructions: conv.customInstructions,
        agentSkillsEnabled: conv.agentSkillsEnabled,
        fileContextText: fileContextText || undefined,
    });

    const systemId = `ws-system-${conv.id}`;
    const nextSystem: any = {
        id: systemId,
        role: "system",
        parts: [{ type: "text", text: systemText }],
    };

    const existing = chat.messages as any[];
    const first = existing?.[0];
    if (first?.role === "system") {
        existing[0] = nextSystem;
        chat.messages = [...existing] as any;
    } else {
        chat.messages = [nextSystem, ...(existing || [])] as any;
    }
}

// ========== 发送与同步 ==========
function extractTextFromUiMessage(m: UIMessage): string {
    return (
        (m.parts || [])
            .filter((p: any) => p?.type === "text")
            .map((p: any) => p.text ?? "")
            .join("\n") || ""
    );
}

async function syncChatToStore() {
    const conv = selectedConversation.value;
    if (!conv) return;

    const stored: any[] = (chat.messages as any[])
        .filter((m) => m.role !== "system")
        .map((m: UIMessage) => ({
            id: m.id,
            role: m.role,
            content: extractTextFromUiMessage(m),
            timestamp: Date.now(),
            parts: m.parts,
        }));

    await chatStore.updateConversation(conv.id, {
        messages: stored as any,
        modelId: conv.modelId,
        enabledMcpServerIds: conv.enabledMcpServerIds,
        // enabledBuiltinTools: conv.enabledBuiltinTools,
        webSearch: conv.webSearch,
        apiMode: conv.apiMode,
        customInstructions: conv.customInstructions,
        fileContextMode: conv.fileContextMode,
        agentSkillsEnabled: conv.agentSkillsEnabled,
    });
}

watch(
    () => status.value,
    async (next, prev) => {
        if (prev === "streaming" && next !== "streaming") {
            await syncChatToStore();
        }
    },
);

async function handleSubmit(msg: PromptInputMessage) {
    const conv = selectedConversation.value;
    if (!conv) return;

    const hasText = Boolean(msg.text?.trim());
    const hasFiles = Boolean(msg.files?.length);
    if (!hasText && !hasFiles) return;

    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后使用工作区会话");
        void authStore.startLogin();
        return;
    }

    if (isChatBusy.value) return;

    await ensureSystemPromptUpToDate();

    // tools：按会话选择过滤（不影响全局启停）
    const enabledIds = new Set(conv.enabledMcpServerIds || []);
    const toolServers = (mcpStore.servers || []).map((s: any) => ({
        ...s,
        enabled: enabledIds.has(s.id),
    }));

    const mcpTools = await McpUtils.getTools(toolServers as any, {
        skipStopDisabled: true,
    });

    // const builtinEnabled = {
    //     filesystem: Boolean(conv.enabledBuiltinTools?.filesystem),
    //     git: Boolean(conv.enabledBuiltinTools?.git),
    // };
    // const allowedDirectories = conv.workspaceRoot ? [conv.workspaceRoot] : [];
    // const builtinTools = createBuiltinTools({
    //     // enabled: builtinEnabled,
    //     allowedDirectories,
    //     cwd: conv.workspaceRoot || null,
    // });

    const tools = { ...mcpTools };
    clientToolsRef.value = tools;

    const modelId = conv.modelId || selectedModel.value?.id;

    await chat.sendMessage(
        {
            text: hasText ? (msg.text as string) : "已发送附件",
            files: hasFiles ? (msg.files as any) : [],
        },
        {
            body: {
                model: modelId,
                mcpEnabled: Object.keys(tools).length > 0,
                tools,
                ...(conv.webSearch ? { webSearch: true } : {}),
            },
        },
    );
}

// async function toggleBuiltinTool(kind: "filesystem" | "git", checked: boolean) {
//     const conv = selectedConversation.value;
//     if (!conv) return;

//     // const next = {
//     //     filesystem: Boolean(conv.enabledBuiltinTools?.filesystem),
//     //     git: Boolean(conv.enabledBuiltinTools?.git),
//     //     [kind]: checked,
//     // };
//     // conv.enabledBuiltinTools = next;
//     await chatStore.updateConversation(conv.id, {});
// }

function onPromptError(error: { code: string; message: string }) {
    console.error("PromptInput error", error);
}

async function createNewSession() {
    if (!props.workspaceRoot) {
        ElMessage.warning("请先选择工作区目录");
        return;
    }
    const id = await chatStore.createNewConversation();
    await chatStore.selectConversation(id);
}

async function switchSession(id: string) {
    await chatStore.selectConversation(id);
}

const sessionTitleDraft = ref<string>("");
watch(
    () => selectedConversation.value?.title,
    (t) => {
        sessionTitleDraft.value = t || "";
    },
    { immediate: true },
);

async function renameSession() {
    const conv = selectedConversation.value;
    if (!conv) return;
    const title = sessionTitleDraft.value.trim();
    if (!title) return;
    await chatStore.renameConversation(conv.id, title);
}

async function deleteSession() {
    const conv = selectedConversation.value;
    if (!conv) return;
    await chatStore.deleteConversation(conv.id);
}

async function confirmDeleteSession() {
    const conv = selectedConversation.value;
    if (!conv) return;

    try {
        await ElMessageBox.confirm(
            `确定要删除会话“${conv.title}”吗？此操作不可恢复。`,
            "警告",
            {
                confirmButtonText: "删除",
                cancelButtonText: "取消",
                type: "warning",
            },
        );
        await deleteSession();
        settingsOpen.value = false;
    } catch {
        // cancelled
    }
}

async function setConversationModel(modelId: string) {
    const conv = selectedConversation.value;
    if (!conv) return;
    conv.modelId = modelId;
    await chatStore.updateConversation(conv.id, { modelId });
}

async function toggleServer(serverId: string, checked: boolean) {
    const conv = selectedConversation.value;
    if (!conv) return;
    const next = new Set(conv.enabledMcpServerIds || []);
    if (checked) next.add(serverId);
    else next.delete(serverId);
    conv.enabledMcpServerIds = Array.from(next);
    await chatStore.updateConversation(conv.id, {
        enabledMcpServerIds: conv.enabledMcpServerIds,
    });
}
</script>

<template>
    <div class="h-full w-full flex flex-col bg-background">
        <div
            class="px-4 py-3 border-b bg-card/50 flex items-center justify-between gap-4 shrink-0"
        >
            <div class="min-w-0 flex flex-col gap-1.5 flex-1">
                <div
                    class="flex items-center gap-2 text-sm font-semibold leading-none"
                >
                    <span class="truncate">工作区会话</span>
                    <Badge
                        variant="outline"
                        class="font-normal text-xs h-5 px-1.5 gap-1 shrink-0 bg-muted/50 truncate max-w-[200px]"
                    >
                        {{
                            props.workspaceRoot
                                ? props.workspaceRoot.split(/[/\\]/).pop()
                                : "未选择"
                        }}
                    </Badge>
                </div>
                <div
                    class="flex items-center gap-2 text-xs text-muted-foreground min-w-0"
                >
                    <span class="truncate">{{ activeSessionLabel }}</span>
                    <span v-if="props.workspaceRoot" class="opacity-40">|</span>
                    <span
                        v-if="props.workspaceRoot"
                        class="truncate opacity-70 max-w-75"
                        :title="props.workspaceRoot"
                        >{{ props.workspaceRoot }}</span
                    >
                </div>
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger as-child>
                    <Button
                        size="sm"
                        variant="secondary"
                        class="h-8 gap-2 shrink-0 shadow-sm"
                    >
                        <Settings2 class="w-4 h-4" />
                        <span class="hidden sm:inline">会话管理</span>
                        <ChevronDown class="w-3 h-3 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent class="w-56" align="end">
                    <DropdownMenuGroup>
                        <DropdownMenuItem @click="createNewSession">
                            <Plus class="w-4 h-4 mr-2" />
                            新建会话
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            :disabled="!activeKey"
                            @click="settingsOpen = true"
                        >
                            <Settings2 class="w-4 h-4 mr-2" />
                            会话设置
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            :disabled="!activeKey"
                            @click="confirmDeleteSession"
                        >
                            <Trash2 class="w-4 h-4 mr-2" />
                            删除当前会话
                        </DropdownMenuItem>
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator />

                    <DropdownMenuLabel>切换会话</DropdownMenuLabel>

                    <template v-if="conversationsItems.length === 0">
                        <DropdownMenuItem disabled>
                            暂无会话（请先新建）
                        </DropdownMenuItem>
                    </template>
                    <template v-else>
                        <DropdownMenuItem
                            v-for="it in conversationsItems"
                            :key="it.key"
                            @click="switchSession(it.key)"
                        >
                            <Check
                                v-if="it.key === activeKey"
                                class="w-4 h-4 mr-2"
                            />
                            <span v-else class="inline-block w-4 h-4 mr-2" />
                            <span class="truncate">{{ it.label }}</span>
                        </DropdownMenuItem>
                    </template>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-4 scroll-smooth">
            <div
                v-if="!activeKey"
                class="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-4"
            >
                <div
                    class="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center"
                >
                    <RefreshCcwIcon class="w-6 h-6 opacity-50" />
                </div>
                <div class="space-y-1">
                    <h3 class="font-medium text-foreground">没有活动的会话</h3>
                    <p class="text-sm">
                        请从右上角菜单选择或新建一个会话开始工作。
                    </p>
                </div>
                <Button variant="outline" @click="createNewSession">
                    <Plus class="w-4 h-4 mr-2" />
                    新建会话
                </Button>
            </div>

            <Conversation v-else class="h-[calc(100vh-320px)]!">
                <ChatMessageItem
                    v-if="visibleMessages.length > 0"
                    v-for="(m, idx) in visibleMessages"
                    :key="m.id"
                    :message="m"
                    :messageIndex="idx"
                    :status="status"
                    :lastMessageId="lastVisibleMessageId"
                    :lastAssistantMessageId="lastVisibleAssistantMessageId"
                    :sources="getSourceUrlParts(m)"
                    @copy="copyToClipboard"
                    @regenerate="handleRegenerate"
                >
                    <template
                        #text="{
                            message: slotMessage,
                            part,
                            partIndex,
                            isLastTextPart,
                            isStreaming,
                        }"
                    >
                        <template
                            v-if="
                                slotMessage.role === 'user' &&
                                editingUserMessageId === slotMessage.id &&
                                isLastTextPart
                            "
                        >
                            <Textarea
                                v-model="editingUserMessageText"
                                class="min-h-20"
                            />
                        </template>
                        <template v-else>
                            <Shimmer
                                v-if="isStreaming && !part.text"
                                class="text-sm text-muted-foreground"
                                >正在生成回复...</Shimmer
                            >
                            <InlineCitedText
                                v-else-if="slotMessage.role === 'user'"
                                :content="part.text"
                                class="text-sm"
                                trigger-label="mcp"
                            />
                            <MessageResponse
                                v-else
                                :id="`${slotMessage.id}-text-${partIndex}`"
                                :content="part.text"
                                :is-streaming="isStreaming"
                            />
                        </template>
                    </template>

                    <template #user-actions="{ message: slotMessage }">
                        <MessageActions>
                            <template
                                v-if="editingUserMessageId === slotMessage.id"
                            >
                                <MessageAction
                                    label="取消"
                                    @click="cancelEditUserMessage"
                                />
                                <MessageAction
                                    label="发送"
                                    @click="confirmEditAndResendUserMessage()"
                                >
                                    <RefreshCcwIcon class="size-3" />
                                </MessageAction>
                            </template>
                            <template v-else>
                                <MessageAction
                                    label="编辑"
                                    @click="startEditUserMessage(slotMessage)"
                                >
                                    <Pencil class="size-3" />
                                </MessageAction>
                                <MessageAction
                                    label="重新发送"
                                    @click="resendUserMessage(slotMessage)"
                                >
                                    <RefreshCcwIcon class="size-3" />
                                </MessageAction>
                            </template>
                        </MessageActions>
                    </template>
                </ChatMessageItem>
                <ConversationEmptyState v-else>
                    <div
                        class="flex flex-col items-center justify-center space-y-4"
                    >
                        <div class="bg-primary/10 p-6 rounded-full">
                            <Bot class="w-12 h-12 text-primary" />
                        </div>
                        <h1 class="text-2xl font-bold tracking-tight">
                            欢迎使用 Glosc Copilot
                        </h1>
                        <p class="text-muted-foreground max-w-md text-center">
                            您的 AI 智能助手。开始一个新的对话吧。
                        </p>
                    </div>
                </ConversationEmptyState>

                <div
                    v-if="status === 'submitted'"
                    class="pl-4 py-2 flex items-center gap-2"
                >
                    <span class="relative flex h-2 w-2">
                        <span
                            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"
                        ></span>
                        <span
                            class="relative inline-flex rounded-full h-2 w-2 bg-sky-500"
                        ></span>
                    </span>
                    <Shimmer class="text-xs text-muted-foreground"
                        >正在思考...</Shimmer
                    >
                </div>
                <div
                    v-else-if="status === 'streaming'"
                    class="pl-4 py-2 flex items-center gap-2"
                >
                    <span class="relative flex h-2 w-2">
                        <span
                            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
                        ></span>
                        <span
                            class="relative inline-flex rounded-full h-2 w-2 bg-green-500"
                        ></span>
                    </span>
                    <Shimmer class="text-xs text-muted-foreground"
                        >正在生成回复...</Shimmer
                    >
                </div>
            </Conversation>

            <div class="p-4 border-t bg-card/30">
                <PromptInput
                    class="w-full max-w-4xl mx-auto shadow-sm border rounded-lg overflow-hidden bg-background focus-within:ring-1 focus-within:ring-ring transition-all"
                    global-drop
                    multiple
                    @submit="handleSubmit"
                    @error="onPromptError"
                >
                    <PromptInputHeader>
                        <PromptInputAttachments>
                            <template #default="{ file }">
                                <PromptInputAttachment :file="file" />
                            </template>
                        </PromptInputAttachments>
                        <PromptInputResourceCitationsPreview />
                    </PromptInputHeader>

                    <PromptInputBody>
                        <PromptInputTextarea
                            :disabled="!activeKey || isChatBusy"
                            placeholder="在工作区里提需求：修改文件、解释代码、生成补丁…"
                        />
                    </PromptInputBody>

                    <PromptInputFooter>
                        <PromptInputTools>
                            <PromptInputActionMenu>
                                <PromptInputActionMenuTrigger />
                                <PromptInputActionMenuContent>
                                    <PromptInputActionAddAttachments />
                                    <McpPromptInputInsert
                                        :disabled="
                                            !activeKey ||
                                            isChatBusy ||
                                            !selectedConversation
                                        "
                                        :servers="mcpStore.servers"
                                        :enabled-server-ids="
                                            selectedConversation?.enabledMcpServerIds ||
                                            []
                                        "
                                    />
                                </PromptInputActionMenuContent>
                            </PromptInputActionMenu>

                            <Separator
                                orientation="vertical"
                                class="h-4 mx-1"
                            />

                            <div
                                class="text-[10px] text-muted-foreground/70 flex items-center gap-2 px-2 select-none"
                                :title="`模型：${activeModelLabel}；工具：${enabledToolCount}`"
                            >
                                <Badge
                                    variant="outline"
                                    class="h-4 text-[9px] px-1 font-normal bg-muted/50 border-0"
                                >
                                    {{ activeModelLabel }}
                                </Badge>
                                <span
                                    v-if="enabledToolCount > 0"
                                    class="flex items-center gap-0.5"
                                >
                                    工具: {{ enabledToolCount }}
                                </span>
                            </div>

                            <div class="flex-1" />

                            <Button
                                variant="ghost"
                                size="icon"
                                class="h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground"
                                :disabled="!activeKey"
                                @click="settingsOpen = true"
                                title="会话设置"
                            >
                                <Settings2 class="w-4 h-4" />
                            </Button>

                            <PromptInputSubmit
                                :disabled="!activeKey || isChatBusy"
                                :status="status"
                                class="ml-1"
                            />
                        </PromptInputTools>
                    </PromptInputFooter>
                </PromptInput>
            </div>

            <Dialog v-model:open="settingsOpen">
                <DialogContent
                    class="max-w-[700px] h-[800px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
                >
                    <DialogHeader
                        class="px-6 py-4 border-b shrink-0 bg-muted/20"
                    >
                        <DialogTitle>会话设置</DialogTitle>
                        <DialogDescription>
                            配置当前会话 "{{ activeSessionLabel }}" 的参数与能力
                        </DialogDescription>
                    </DialogHeader>

                    <div
                        v-if="!selectedConversation"
                        class="p-8 text-center text-muted-foreground"
                    >
                        没有选中的会话
                    </div>

                    <div
                        v-else
                        class="flex-1 overflow-hidden flex flex-col bg-background"
                    >
                        <Tabs
                            default-value="general"
                            class="flex-1 flex flex-col h-full"
                        >
                            <div class="px-6 pt-4 shrink-0">
                                <TabsList
                                    class="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/50"
                                >
                                    <TabsTrigger
                                        value="general"
                                        class="px-4 py-2"
                                        >常规设置</TabsTrigger
                                    >
                                    <TabsTrigger
                                        value="context"
                                        class="px-4 py-2"
                                        >上下文控制</TabsTrigger
                                    >
                                    <TabsTrigger
                                        value="capabilities"
                                        class="px-4 py-2"
                                        >能力与工具</TabsTrigger
                                    >
                                    <TabsTrigger
                                        value="danger"
                                        class="px-4 py-2 text-destructive data-[state=active]:text-destructive hover:text-destructive"
                                        >危险区域</TabsTrigger
                                    >
                                </TabsList>
                            </div>

                            <div class="flex-1 overflow-y-auto p-6 min-h-0">
                                <!-- General Tab -->
                                <TabsContent
                                    value="general"
                                    class="space-y-6 mt-0"
                                >
                                    <div class="grid gap-4">
                                        <div class="grid gap-2">
                                            <Label>会话标题</Label>
                                            <div class="flex gap-2">
                                                <Input
                                                    v-model="sessionTitleDraft"
                                                    placeholder="会话标题"
                                                    class="flex-1"
                                                />
                                                <Button
                                                    variant="outline"
                                                    @click="renameSession"
                                                    >保存</Button
                                                >
                                            </div>
                                        </div>

                                        <div class="grid gap-2">
                                            <Label>模型选择</Label>
                                            <ModelSelectorPicker
                                                :models="availableModels"
                                                :selected-model="
                                                    selectedConversationModelInfo
                                                "
                                                :selected-model-id="
                                                    selectedConversationModelId
                                                "
                                                @select="
                                                    (m) =>
                                                        setConversationModel(
                                                            m.id,
                                                        )
                                                "
                                                class="w-full"
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                <!-- Context Tab -->
                                <TabsContent
                                    value="context"
                                    class="space-y-6 mt-0"
                                >
                                    <div class="grid gap-2">
                                        <Label
                                            >自定义工作区指令 (System
                                            Prompt)</Label
                                        >
                                        <Textarea
                                            :model-value="
                                                selectedConversation.customInstructions ||
                                                ''
                                            "
                                            rows="6"
                                            placeholder="例如：优先修改 typescript 文件；回答用中文；输出时给出文件路径与命令等"
                                            class="resize-none"
                                            @update:model-value="
                                                (v) =>
                                                    chatStore.updateConversation(
                                                        selectedConversation!
                                                            .id,
                                                        {
                                                            customInstructions:
                                                                String(v),
                                                        },
                                                    )
                                            "
                                        />
                                    </div>

                                    <Separator />

                                    <div class="grid gap-2">
                                        <Label>文件上下文注入模式</Label>
                                        <div
                                            class="text-xs text-muted-foreground mb-2"
                                        >
                                            控制引用文件时是注入文件路径列表还是完整内容。
                                        </div>
                                        <Select
                                            :model-value="
                                                selectedConversation.fileContextMode
                                            "
                                            @update:model-value="
                                                (v) =>
                                                    chatStore.updateConversation(
                                                        selectedConversation!
                                                            .id,
                                                        {
                                                            fileContextMode:
                                                                v as any,
                                                        },
                                                    )
                                            "
                                        >
                                            <SelectTrigger>
                                                <SelectValue
                                                    placeholder="选择模式"
                                                />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none"
                                                    >不自动注入</SelectItem
                                                >
                                                <SelectItem value="list"
                                                    >仅注入文件列表 (节省
                                                    Token)</SelectItem
                                                >
                                                <SelectItem value="contents"
                                                    >注入文件内容
                                                    (高消耗)</SelectItem
                                                >
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </TabsContent>

                                <!-- Capabilities Tab -->
                                <TabsContent
                                    value="capabilities"
                                    class="space-y-6 mt-0"
                                >
                                    <div class="space-y-4">
                                        <div
                                            class="flex items-center justify-between border rounded-lg p-4"
                                        >
                                            <div class="space-y-0.5">
                                                <Label class="text-base"
                                                    >Web 搜索</Label
                                                >
                                                <div
                                                    class="text-sm text-muted-foreground"
                                                >
                                                    允许模型进行联网搜索以获取最新信息
                                                </div>
                                            </div>
                                            <div class="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    class="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                                                    :checked="
                                                        Boolean(
                                                            selectedConversation.webSearch,
                                                        )
                                                    "
                                                    @change="
                                                        chatStore.updateConversation(
                                                            selectedConversation!
                                                                .id,
                                                            {
                                                                webSearch: (
                                                                    $event.target as HTMLInputElement
                                                                ).checked,
                                                            },
                                                        )
                                                    "
                                                />
                                            </div>
                                        </div>

                                        <div
                                            class="flex items-center justify-between border rounded-lg p-4"
                                        >
                                            <div class="space-y-0.5">
                                                <Label class="text-base"
                                                    >Agent Skills</Label
                                                >
                                                <div
                                                    class="text-sm text-muted-foreground"
                                                >
                                                    启用高级代理指令（如自动执行、规划等）
                                                </div>
                                            </div>
                                            <div class="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    class="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                                                    :checked="
                                                        selectedConversation.agentSkillsEnabled !==
                                                        false
                                                    "
                                                    @change="
                                                        chatStore.updateConversation(
                                                            selectedConversation!
                                                                .id,
                                                            {
                                                                agentSkillsEnabled:
                                                                    (
                                                                        $event.target as HTMLInputElement
                                                                    ).checked,
                                                            },
                                                        )
                                                    "
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <Separator />

                                    <div class="space-y-3">
                                        <div
                                            class="flex items-center justify-between"
                                        >
                                            <Label class="text-base"
                                                >MCP Servers</Label
                                            >
                                            <Button
                                                variant="link"
                                                size="sm"
                                                class="h-auto p-0"
                                                as-child
                                            >
                                                <router-link to="/mcp"
                                                    >配置服务器</router-link
                                                >
                                            </Button>
                                        </div>

                                        <div
                                            v-if="mcpStore.servers.length === 0"
                                            class="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md text-center"
                                        >
                                            未配置任何 MCP Server
                                        </div>
                                        <div
                                            v-else
                                            class="grid grid-cols-1 sm:grid-cols-2 gap-3"
                                        >
                                            <div
                                                v-for="s in mcpStore.servers"
                                                :key="s.id"
                                                class="flex items-start space-x-3 space-y-0 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                                                :class="{
                                                    'bg-primary/5 border-primary/20':
                                                        (
                                                            selectedConversation.enabledMcpServerIds ||
                                                            []
                                                        ).includes(s.id),
                                                }"
                                            >
                                                <input
                                                    type="checkbox"
                                                    :id="`server-${s.id}`"
                                                    class="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                                                    :checked="
                                                        (
                                                            selectedConversation.enabledMcpServerIds ||
                                                            []
                                                        ).includes(s.id)
                                                    "
                                                    @change="
                                                        toggleServer(
                                                            s.id,
                                                            (
                                                                $event.target as HTMLInputElement
                                                            ).checked,
                                                        )
                                                    "
                                                />
                                                <div
                                                    class="flex flex-col gap-1 overflow-hidden"
                                                >
                                                    <label
                                                        :for="`server-${s.id}`"
                                                        class="text-sm font-medium leading-none cursor-pointer truncate"
                                                    >
                                                        {{ s.name }}
                                                    </label>
                                                    <span
                                                        class="text-xs text-muted-foreground line-clamp-2"
                                                        :title="
                                                            JSON.stringify(s)
                                                        "
                                                    >
                                                        {{
                                                            (s as any).type ===
                                                            "stdio"
                                                                ? `${(s as any).command} ${((s as any).args || []).join(" ")}`
                                                                : (s as any).url
                                                        }}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <!-- Danger Tab -->
                                <TabsContent
                                    value="danger"
                                    class="space-y-6 mt-0"
                                >
                                    <div
                                        class="rounded-lg border border-destructive/50 bg-destructive/5 p-4"
                                    >
                                        <div
                                            class="flex items-center justify-between"
                                        >
                                            <div class="space-y-1">
                                                <h4
                                                    class="text-sm font-medium text-destructive"
                                                >
                                                    删除会话
                                                </h4>
                                                <p
                                                    class="text-sm text-muted-foreground"
                                                >
                                                    一旦删除，该会话的所有历史记录将无法恢复。
                                                </p>
                                            </div>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                @click="confirmDeleteSession"
                                            >
                                                删除当前会话
                                            </Button>
                                        </div>
                                    </div>
                                </TabsContent>
                            </div>
                        </Tabs>
                    </div>

                    <DialogFooter class="p-4 border-t shrink-0 bg-muted/20">
                        <Button variant="outline" @click="settingsOpen = false"
                            >完成</Button
                        >
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    </div>
</template>
