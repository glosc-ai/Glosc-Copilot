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
} from "@/components/ui/dialog";

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
// import { createBuiltinTools } from "@/utils/BuiltinTools";

import { readDir, readTextFile } from "@tauri-apps/plugin-fs";

import type { ChatStatus, SourceUrlUIPart, UIMessage } from "ai";

import {
    Check,
    ChevronDown,
    MoreHorizontal,
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

    chat.regenerate({
        body: {
            model: modelId,
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

    await chat.sendMessage(
        { text, messageId, files },
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
onMounted(async () => {
    await mcpStore.init();
    void mcpStore.checkConnections();
    await chatStore.setWorkspaceRoot(props.workspaceRoot);
});

watch(
    () => props.workspaceRoot,
    async (next) => {
        await chatStore.setWorkspaceRoot(next);
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
    <div class="h-full w-full flex flex-col">
        <div class="px-3 py-2 border-b">
            <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium truncate">
                        工作区 AI 会话
                    </div>
                    <div class="text-xs text-muted-foreground truncate">
                        {{ props.workspaceRoot || "未选择工作区" }}
                    </div>
                    <div class="text-xs text-muted-foreground truncate">
                        当前会话：{{ activeSessionLabel }}
                    </div>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button
                            size="sm"
                            variant="outline"
                            class="shrink-0 gap-2"
                        >
                            <MoreHorizontal class="w-4 h-4" />
                            会话
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
                                <span
                                    v-else
                                    class="inline-block w-4 h-4 mr-2"
                                />
                                <span class="truncate">{{ it.label }}</span>
                            </DropdownMenuItem>
                        </template>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div class="mt-2 text-xs text-muted-foreground">
                模型/工具/Web 搜索/指令等设置已移到下方输入框。
            </div>
        </div>

        <div class="flex-1 min-h-0 overflow-auto p-3">
            <div v-if="!activeKey" class="text-sm text-muted-foreground">
                请选择或新建一个会话。
            </div>

            <div v-else class="space-y-3">
                <ChatMessageItem
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

                <div v-if="status === 'submitted'" class="pl-4 py-2">
                    <Shimmer class="text-xs text-muted-foreground"
                        >正在思考...</Shimmer
                    >
                </div>
                <div v-else-if="status === 'streaming'" class="pl-4 py-2">
                    <Shimmer class="text-xs text-muted-foreground"
                        >正在生成回复...</Shimmer
                    >
                </div>
            </div>
        </div>

        <div class="border-t p-2">
            <PromptInput
                class="w-full"
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

                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 px-2"
                            :disabled="!activeKey"
                            @click="settingsOpen = true"
                            title="会话设置"
                        >
                            <Settings2 class="w-4 h-4" />
                        </Button>

                        <div class="flex-1" />

                        <div
                            class="text-[11px] text-muted-foreground mr-2 truncate"
                            :title="`模型：${activeModelLabel}；工具：${enabledToolCount}`"
                        >
                            模型：{{ activeModelLabel }}；工具：{{
                                enabledToolCount
                            }}
                        </div>

                        <PromptInputSubmit
                            :disabled="!activeKey || isChatBusy"
                            :status="status"
                        />
                    </PromptInputTools>
                </PromptInputFooter>
            </PromptInput>
        </div>

        <Dialog v-model:open="settingsOpen">
            <DialogContent
                class="w-[92vw] max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
            >
                <DialogHeader>
                    <DialogTitle>会话设置</DialogTitle>
                </DialogHeader>

                <div class="flex-1 overflow-y-auto pr-1 space-y-4">
                    <div
                        v-if="!selectedConversation"
                        class="text-sm text-muted-foreground"
                    >
                        请先选择或新建一个会话。
                    </div>

                    <template v-else>
                        <Collapsible
                            v-slot="{ open }"
                            :default-open="true"
                            class="rounded-md border"
                        >
                            <CollapsibleTrigger as-child>
                                <Button
                                    variant="ghost"
                                    class="w-full justify-between px-3"
                                >
                                    <span class="text-sm font-medium"
                                        >基础</span
                                    >
                                    <ChevronDown
                                        class="w-4 h-4 opacity-70 transition-transform"
                                        :class="open ? 'rotate-180' : ''"
                                    />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent class="px-3 pb-3 space-y-4">
                                <div class="grid gap-2">
                                    <div class="text-xs text-muted-foreground">
                                        会话标题
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <Input
                                            v-model="sessionTitleDraft"
                                            class="h-8"
                                            placeholder="会话标题"
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            @click="renameSession"
                                        >
                                            保存
                                        </Button>
                                    </div>
                                </div>

                                <div class="grid gap-2">
                                    <div class="text-xs text-muted-foreground">
                                        模型
                                    </div>
                                    <ModelSelectorPicker
                                        :models="availableModels"
                                        :selected-model="
                                            selectedConversationModelInfo
                                        "
                                        :selected-model-id="
                                            selectedConversationModelId
                                        "
                                        @select="
                                            (m) => setConversationModel(m.id)
                                        "
                                    />
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        <Collapsible
                            v-slot="{ open }"
                            :default-open="true"
                            class="rounded-md border"
                        >
                            <CollapsibleTrigger as-child>
                                <Button
                                    variant="ghost"
                                    class="w-full justify-between px-3"
                                >
                                    <span class="text-sm font-medium"
                                        >上下文</span
                                    >
                                    <ChevronDown
                                        class="w-4 h-4 opacity-70 transition-transform"
                                        :class="open ? 'rotate-180' : ''"
                                    />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent class="px-3 pb-3 space-y-4">
                                <div class="grid gap-2">
                                    <div class="text-xs text-muted-foreground">
                                        文件上下文注入
                                    </div>
                                    <select
                                        class="h-8 w-full rounded-md border bg-background px-2 text-sm"
                                        v-model="
                                            selectedConversation.fileContextMode
                                        "
                                        @change="
                                            chatStore.updateConversation(
                                                selectedConversation!.id,
                                                {
                                                    fileContextMode:
                                                        selectedConversation!
                                                            .fileContextMode,
                                                },
                                            )
                                        "
                                    >
                                        <option value="none">不注入</option>
                                        <option value="list">
                                            注入文件列表（截断）
                                        </option>
                                        <option value="contents">
                                            注入文件内容（截断）
                                        </option>
                                    </select>
                                </div>

                                <div class="grid gap-2">
                                    <div class="text-xs text-muted-foreground">
                                        自定义工作区指令
                                    </div>
                                    <Textarea
                                        :model-value="
                                            selectedConversation.customInstructions ||
                                            ''
                                        "
                                        rows="4"
                                        placeholder="例如：优先修改 typescript 文件；回答用中文；输出时给出文件路径与命令等"
                                        @update:model-value="
                                            (v) =>
                                                chatStore.updateConversation(
                                                    selectedConversation!.id,
                                                    {
                                                        customInstructions:
                                                            String(v),
                                                    },
                                                )
                                        "
                                    />
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        <Collapsible
                            v-slot="{ open }"
                            class="rounded-md border"
                        >
                            <CollapsibleTrigger as-child>
                                <Button
                                    variant="ghost"
                                    class="w-full justify-between px-3"
                                >
                                    <span class="text-sm font-medium"
                                        >能力</span
                                    >
                                    <ChevronDown
                                        class="w-4 h-4 opacity-70 transition-transform"
                                        :class="open ? 'rotate-180' : ''"
                                    />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent class="px-3 pb-3 space-y-3">
                                <label class="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        :checked="
                                            selectedConversation.agentSkillsEnabled !==
                                            false
                                        "
                                        @change="
                                            chatStore.updateConversation(
                                                selectedConversation!.id,
                                                {
                                                    agentSkillsEnabled: (
                                                        $event.target as HTMLInputElement
                                                    ).checked,
                                                },
                                            )
                                        "
                                    />
                                    <span>启用 Agent Skills 指令</span>
                                </label>

                                <label class="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        :checked="
                                            Boolean(
                                                selectedConversation.webSearch,
                                            )
                                        "
                                        @change="
                                            chatStore.updateConversation(
                                                selectedConversation!.id,
                                                {
                                                    webSearch: (
                                                        $event.target as HTMLInputElement
                                                    ).checked,
                                                },
                                            )
                                        "
                                    />
                                    <span>启用 Web 搜索</span>
                                </label>
                            </CollapsibleContent>
                        </Collapsible>

                        <Collapsible
                            v-slot="{ open }"
                            :default-open="true"
                            class="rounded-md border"
                        >
                            <CollapsibleTrigger as-child>
                                <Button
                                    variant="ghost"
                                    class="w-full justify-between px-3"
                                >
                                    <span class="text-sm font-medium"
                                        >工具</span
                                    >
                                    <ChevronDown
                                        class="w-4 h-4 opacity-70 transition-transform"
                                        :class="open ? 'rotate-180' : ''"
                                    />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent class="px-3 pb-3 space-y-4">
                                <div class="grid gap-2">
                                    <div class="text-xs text-muted-foreground">
                                        按会话启用
                                    </div>

                                    <!-- <div class="rounded-md border p-2">
                                        <div
                                            class="text-xs text-muted-foreground"
                                        >
                                            内置工具（本地执行；仅允许访问工作区目录）
                                        </div>
                                        <div class="mt-2 grid gap-2">
                                            <label
                                                class="flex items-center gap-2 text-sm"
                                            >
                                                <input
                                                    type="checkbox"
                                                    :checked="
                                                        Boolean(
                                                            selectedConversation
                                                                .enabledBuiltinTools
                                                                ?.filesystem,
                                                        )
                                                    "
                                                    @change="
                                                        toggleBuiltinTool(
                                                            'filesystem',
                                                            (
                                                                $event.target as HTMLInputElement
                                                            ).checked,
                                                        )
                                                    "
                                                />
                                                <span>文件系统</span>
                                            </label>
                                            <label
                                                class="flex items-center gap-2 text-sm"
                                            >
                                                <input
                                                    type="checkbox"
                                                    :checked="
                                                        Boolean(
                                                            selectedConversation
                                                                .enabledBuiltinTools
                                                                ?.git,
                                                        )
                                                    "
                                                    @change="
                                                        toggleBuiltinTool(
                                                            'git',
                                                            (
                                                                $event.target as HTMLInputElement
                                                            ).checked,
                                                        )
                                                    "
                                                />
                                                <span>Git</span>
                                            </label>
                                        </div>
                                    </div> -->

                                    <div
                                        v-if="mcpStore.servers.length === 0"
                                        class="text-xs text-muted-foreground"
                                    >
                                        未配置 MCP Server（可到 MCP 页面配置）
                                    </div>
                                    <div
                                        v-else
                                        class="max-h-56 overflow-auto rounded-md border p-2"
                                    >
                                        <label
                                            v-for="s in mcpStore.servers"
                                            :key="s.id"
                                            class="flex items-center gap-2 text-sm py-1"
                                        >
                                            <input
                                                type="checkbox"
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
                                            <span class="truncate">{{
                                                s.name
                                            }}</span>
                                        </label>
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        <Collapsible
                            v-slot="{ open }"
                            class="rounded-md border border-destructive/30"
                        >
                            <CollapsibleTrigger as-child>
                                <Button
                                    variant="ghost"
                                    class="w-full justify-between px-3 text-destructive"
                                >
                                    <span class="text-sm font-medium"
                                        >危险操作</span
                                    >
                                    <ChevronDown
                                        class="w-4 h-4 opacity-70 transition-transform"
                                        :class="open ? 'rotate-180' : ''"
                                    />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent class="px-3 pb-3">
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    class="gap-2"
                                    @click="confirmDeleteSession"
                                >
                                    <Trash2 class="w-4 h-4" />
                                    删除当前会话
                                </Button>
                            </CollapsibleContent>
                        </Collapsible>
                    </template>
                </div>

                <DialogFooter>
                    <Button variant="ghost" @click="settingsOpen = false"
                        >关闭</Button
                    >
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
