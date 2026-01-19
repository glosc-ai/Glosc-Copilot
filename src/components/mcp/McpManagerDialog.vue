<script setup lang="ts">
import {
    Plus,
    Trash2,
    Edit,
    Activity,
    Code,
    FileText,
    Loader2,
    GripVertical,
    ExternalLink,
    RefreshCw,
    Star,
    MoreVertical,
} from "lucide-vue-next";

import { openUrl } from "@tauri-apps/plugin-opener";

import { GloscStoreApi } from "@/utils/GloscStoreApi";
import { updateStoreTool } from "@/utils/StoreToolInstaller";
import {
    getStoreToolAccessInfoFromEnv,
    isStoreToolBlocked,
} from "@/utils/StoreToolAccess";

import { VueDraggableNext } from "vue-draggable-next";

import { Codemirror } from "vue-codemirror";

import { json, jsonLanguage } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import {
    autocompletion,
    completionKeymap,
    closeBrackets,
    closeBracketsKeymap,
    type CompletionContext,
    acceptCompletion,
} from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { highlightActiveLineGutter, lineNumbers } from "@codemirror/view";
import {
    syntaxHighlighting,
    defaultHighlightStyle,
    bracketMatching,
    indentOnInput,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
    keymap,
    highlightSpecialChars,
    drawSelection,
    dropCursor,
    highlightActiveLine,
} from "@codemirror/view";

const uiStore = useUiStore();
const mcpStore = useMcpStore();
const authStore = useAuthStore();

const loadedOnce = ref(false);

const storeToolBrowserOpen = ref(false);

// When ElementPlus MessageBox is shown, clicks happen outside of the Reka Dialog
// content tree, which can be interpreted as an outside-interaction and dismiss
// the manager dialog. We gate outside-dismiss while MessageBox is open.
const messageBoxOpen = ref(false);

// Add/Edit dialog state
const isDialogOpen = ref(false);
const editingServer = ref<McpServer | null>(null);
const inputMode = ref<"form" | "json">("form");
const jsonContent = ref("");

const onSortEnd = async () => {
    await mcpStore.saveServers();
};

// Per-server action loading states
const togglingServerIds = ref<Set<string>>(new Set());
const testingServerIds = ref<Set<string>>(new Set());
const updatingServerIds = ref<Set<string>>(new Set());
const toggleActionLabel = ref<Record<string, "enable" | "disable">>({});

const isServerBusy = (serverId: string) =>
    togglingServerIds.value.has(serverId) ||
    testingServerIds.value.has(serverId) ||
    updatingServerIds.value.has(serverId);

const getStoreSlug = (server: McpServer) =>
    server.type === "stdio" ? (server.env?.GLOSC_STORE_SLUG as any) : null;

const isStoreInstalledServer = (server: McpServer) =>
    Boolean(getStoreSlug(server));

const getStoreKind = (server: McpServer) =>
    server.type === "stdio" ? (server.env?.GLOSC_STORE_KIND as any) : null;

const getStoreVersion = (server: McpServer) =>
    server.type === "stdio" ? (server.env?.GLOSC_STORE_VERSION as any) : null;

const getStoreAccess = (server: McpServer) =>
    getStoreToolAccessInfoFromEnv(server);

const getStoreDescription = (server: McpServer) => {
    if (server.type !== "stdio") return null;
    const raw = server.env?.GLOSC_STORE_DESCRIPTION;
    const text = String(raw || "").trim();
    return text || null;
};

const getStoreDetailUrl = (slug: string) =>
    `${GloscStoreApi.host()}/store/plugins/${encodeURIComponent(slug)}`;

const openExternalUrl = async (url: string) => {
    if (!url) return;
    try {
        if (!(window as any).__TAURI_INTERNALS__) {
            window.open(url, "_blank", "noopener,noreferrer");
            return;
        }
        await openUrl(url);
    } catch {
        ElMessage.error("无法打开页面");
    }
};

const openStoreDetailByServer = async (server: McpServer, anchor?: string) => {
    const slug = String(getStoreSlug(server) || "").trim();
    if (!slug) return;
    const base = getStoreDetailUrl(slug);
    const url = anchor ? `${base}${anchor}` : base;
    await openExternalUrl(url);
};

// Capability dialog state
const capabilityDialogOpen = ref(false);
const capabilityDialogServerId = ref<string | null>(null);
const capabilityDialogInitialTab = ref<"tools" | "resources" | "templates">(
    "tools",
);

const capabilityDialogServer = computed(() => {
    const id = capabilityDialogServerId.value;
    if (!id) return null;
    return mcpStore.servers.find((s) => s.id === id) || null;
});

const capabilityDialogCaps = computed(() => {
    const id = capabilityDialogServerId.value;
    if (!id) return null;
    return mcpStore.serverCapabilities[id] || null;
});

const openCapabilityDialog = (
    serverId: string,
    tab: "tools" | "resources" | "templates",
) => {
    capabilityDialogServerId.value = serverId;
    capabilityDialogInitialTab.value = tab;
    capabilityDialogOpen.value = true;
};

const getServerState = (server: McpServer) => {
    const cap = mcpStore.serverCapabilities[server.id];
    if (cap && cap.success === false) return "error" as const;
    return server.enabled ? ("enabled" as const) : ("disabled" as const);
};

const getServerStateLabel = (server: McpServer) => {
    const state = getServerState(server);
    if (state === "error") return "异常";
    return state === "enabled" ? "已启用" : "已禁用";
};

const getServerStateClass = (server: McpServer) => {
    const state = getServerState(server);
    if (state === "enabled") {
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
    }
    if (state === "error") {
        return "bg-destructive/10 text-destructive";
    }
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100";
};

const mcpCompletion = (context: CompletionContext) => {
    const word = context.matchBefore(/\w*/) || {
        from: context.pos,
        to: context.pos,
        text: "",
    };

    // Check if we are inside quotes
    const charBefore = context.state.sliceDoc(word.from - 1, word.from);
    const isQuoted = charBefore === '"';

    const charAfter = context.state.sliceDoc(context.pos, context.pos + 1);
    const hasClosingQuote = charAfter === '"';

    if (word.from === word.to && !context.explicit && !isQuoted) {
        return null;
    }

    const properties = [
        {
            label: "servers",
            template: 'servers": {\n\t\n}',
            detail: "Server configurations",
        },
        {
            label: "type",
            template: 'type": "stdio"',
            detail: "Transport type",
        },
        { label: "command", template: 'command": ""', detail: "Executable" },
        { label: "args", template: 'args": []', detail: "Arguments" },
        { label: "env", template: 'env": {}', detail: "Environment variables" },
        { label: "url", template: 'url": ""', detail: "Server URL" },
        { label: "headers", template: 'headers": {}', detail: "HTTP headers" },
    ];

    const values = [
        { label: "stdio", type: "text" },
        { label: "http", type: "text" },
    ];

    const shouldConsumeQuote = isQuoted && hasClosingQuote;

    return {
        from: word.from,
        to: shouldConsumeQuote ? context.pos + 1 : context.pos,
        options: [
            ...properties.map((p) => ({
                label: p.label,
                type: "property",
                apply: isQuoted ? p.template : `\"${p.template}`,
                detail: p.detail,
            })),
            ...values.map((v) => ({
                label: v.label,
                type: "text",
                apply: shouldConsumeQuote ? v.label + '"' : v.label,
                detail: v.type,
            })),
        ],
    };
};

const extensions = [
    json(),
    jsonLanguage.data.of({
        autocomplete: mcpCompletion,
    }),
    oneDark,
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...completionKeymap,
        ...lintKeymap,
        { key: "Tab", run: acceptCompletion },
        indentWithTab,
    ]),
];

const form = ref({
    type: "stdio" as "stdio" | "http",
    name: "",
    command: "",
    args: "",
    env: "",
    url: "",
    headers: "",
});

const resetForm = () => {
    form.value = {
        type: "stdio",
        name: "",
        command: "",
        args: "",
        env: "",
        url: "",
        headers: "",
    };
    jsonContent.value = JSON.stringify(
        {
            servers: {
                "example-server": {
                    type: "stdio",
                    command: "",
                    args: [],
                    env: {},
                },
            },
        },
        null,
        2,
    );
    editingServer.value = null;
    inputMode.value = "form";
};

const openAddDialog = () => {
    resetForm();
    isDialogOpen.value = true;
};

const openEditDialog = (server: McpServer) => {
    editingServer.value = server;
    if (server.type === "stdio") {
        form.value = {
            type: "stdio",
            name: server.name,
            command: server.command,
            args: server.args.join(" "),
            env: JSON.stringify(server.env, null, 2),
            url: "",
            headers: "",
        };
        jsonContent.value = JSON.stringify(
            {
                servers: {
                    [server.name]: {
                        type: "stdio",
                        command: server.command,
                        args: server.args,
                        env: server.env,
                    },
                },
            },
            null,
            2,
        );
    } else {
        form.value = {
            type: "http",
            name: server.name,
            command: "",
            args: "",
            env: "",
            url: server.url,
            headers: JSON.stringify(server.headers, null, 2),
        };
        jsonContent.value = JSON.stringify(
            {
                servers: {
                    [server.name]: {
                        type: "http",
                        url: server.url,
                        headers: server.headers,
                    },
                },
            },
            null,
            2,
        );
    }
    isDialogOpen.value = true;
};

const syncToJson = () => {
    if (form.value.type === "stdio") {
        const args = form.value.args.split(" ").filter(Boolean);
        let env = {};
        try {
            env = form.value.env ? JSON.parse(form.value.env) : {};
        } catch {
            // ignore
        }
        jsonContent.value = JSON.stringify(
            {
                servers: {
                    [form.value.name || "example-server"]: {
                        type: "stdio",
                        command: form.value.command,
                        args,
                        env,
                    },
                },
            },
            null,
            2,
        );
    } else {
        let headers = {};
        try {
            headers = form.value.headers ? JSON.parse(form.value.headers) : {};
        } catch {
            // ignore
        }
        jsonContent.value = JSON.stringify(
            {
                servers: {
                    [form.value.name || "example-server"]: {
                        type: "http",
                        url: form.value.url,
                        headers,
                    },
                },
            },
            null,
            2,
        );
    }
};

const stripJsonComments = (jsonStr: string) => {
    return jsonStr.replace(
        /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
        (m, g) => (g ? "" : m),
    );
};

const splitCommandLine = (commandLine: string) => {
    const text = (commandLine || "").trim();
    if (!text) return { command: "", args: [] as string[] };

    const parts: string[] = [];
    let current = "";
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === "\\" && i + 1 < text.length && inDouble) {
            const next = text[i + 1];
            if (next === '"' || next === "\\") {
                current += next;
                i++;
                continue;
            }
        }

        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
            continue;
        }
        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            continue;
        }

        if (!inSingle && !inDouble && /\s/.test(ch)) {
            if (current) {
                parts.push(current);
                current = "";
            }
            continue;
        }

        current += ch;
    }

    if (current) parts.push(current);
    const [command, ...args] = parts;
    return { command: command ?? "", args };
};

const parseServerConfig = (jsonStr: string) => {
    try {
        const data = JSON.parse(stripJsonComments(jsonStr));
        const configs: any[] = [];

        // Handle "mcpServers" wrapper (VSCode/Claude format)
        if (data.mcpServers && typeof data.mcpServers === "object") {
            const keys = Object.keys(data.mcpServers);
            for (const name of keys) {
                const config = data.mcpServers[name];
                let command = config.command;
                let args = config.args || [];
                if (
                    typeof command === "string" &&
                    Array.isArray(args) &&
                    args.length === 0
                ) {
                    const parsed = splitCommandLine(command);
                    if (parsed.command) {
                        command = parsed.command;
                        args = parsed.args;
                    }
                }
                configs.push({
                    type: config.type || "stdio",
                    name: name,
                    command,
                    args,
                    env: config.env || {},
                    url: config.url,
                    headers: config.headers,
                });
            }
            if (configs.length > 0) return configs;
        }

        // Handle "servers" wrapper (Standard format)
        if (data.servers && typeof data.servers === "object") {
            const keys = Object.keys(data.servers);
            for (const name of keys) {
                const config = data.servers[name];
                let command = config.command;
                let args = config.args || [];
                if (
                    typeof command === "string" &&
                    Array.isArray(args) &&
                    args.length === 0
                ) {
                    const parsed = splitCommandLine(command);
                    if (parsed.command) {
                        command = parsed.command;
                        args = parsed.args;
                    }
                }
                configs.push({
                    type: config.type || "stdio",
                    name: name,
                    command,
                    args,
                    env: config.env || {},
                    url: config.url,
                    headers: config.headers,
                });
            }
            if (configs.length > 0) return configs;
        }

        // Handle direct server config
        let directCommand = data.command;
        let directArgs = data.args || [];
        if (
            typeof directCommand === "string" &&
            Array.isArray(directArgs) &&
            directArgs.length === 0
        ) {
            const parsed = splitCommandLine(directCommand);
            if (parsed.command) {
                directCommand = parsed.command;
                directArgs = parsed.args;
            }
        }
        return [
            {
                type: data.type || (data.url ? "http" : "stdio"),
                name: data.name,
                command: directCommand,
                args: directArgs,
                env: data.env || {},
                url: data.url,
                headers: data.headers || {},
            },
        ];
    } catch {
        return null;
    }
};

const syncToForm = () => {
    const parsed = parseServerConfig(jsonContent.value);
    if (parsed && parsed.length > 0) {
        const config = parsed[0];
        form.value = {
            type: config.type as "stdio" | "http",
            name: config.name || form.value.name || "",
            command: config.command || "",
            args: Array.isArray(config.args) ? config.args.join(" ") : "",
            env: JSON.stringify(config.env || {}, null, 2),
            url: config.url || "",
            headers: JSON.stringify(config.headers || {}, null, 2),
        };
    }
};

watch(inputMode, (newMode) => {
    if (newMode === "json") {
        syncToJson();
    } else {
        syncToForm();
    }
});

const saveServer = async () => {
    let serverDataList: any[] = [];

    if (inputMode.value === "json") {
        const parsed = parseServerConfig(jsonContent.value);
        if (!parsed || parsed.length === 0) {
            ElMessage.error("无效的 JSON 配置");
            return;
        }
        serverDataList = parsed;
    } else {
        let serverData: any = {};
        serverData.type = form.value.type;
        serverData.name = form.value.name;
        if (serverData.type === "stdio") {
            const argsFromField = form.value.args.split(" ").filter(Boolean);
            if (argsFromField.length === 0) {
                const parsed = splitCommandLine(form.value.command);
                serverData.command = parsed.command;
                serverData.args = parsed.args;
            } else {
                serverData.command = form.value.command;
                serverData.args = argsFromField;
            }
            try {
                serverData.env = form.value.env
                    ? JSON.parse(form.value.env)
                    : {};
            } catch {
                ElMessage.error("环境变量必须是有效的 JSON");
                return;
            }
        } else {
            serverData.url = form.value.url;
            try {
                serverData.headers = form.value.headers
                    ? JSON.parse(form.value.headers)
                    : {};
            } catch {
                ElMessage.error("Headers 必须是有效的 JSON");
                return;
            }
        }
        serverDataList = [serverData];
    }

    if (editingServer.value) {
        // Update existing server
        const serverData = serverDataList[0];
        if (!serverData.name) serverData.name = form.value.name;

        if (!serverData.name) {
            ElMessage.error("名称是必填项");
            return;
        }
        if (serverData.type === "stdio" && !serverData.command) {
            ElMessage.error("stdio 服务器必须指定命令");
            return;
        }
        if (serverData.type === "http" && !serverData.url) {
            ElMessage.error("http 服务器必须指定 URL");
            return;
        }

        await mcpStore.updateServer(editingServer.value.id, serverData);
    } else {
        // Add new server(s)
        let addedCount = 0;
        for (const serverData of serverDataList) {
            if (!serverData.name && serverDataList.length === 1)
                serverData.name = form.value.name;

            if (!serverData.name) continue; // Skip if no name
            if (serverData.type === "stdio" && !serverData.command) continue;
            if (serverData.type === "http" && !serverData.url) continue;

            await mcpStore.addServer({
                ...serverData,
                enabled: true,
            });
            addedCount++;
        }
        if (addedCount === 0) {
            ElMessage.error("未找到可添加的有效服务器");
            return;
        }
    }
    isDialogOpen.value = false;
    resetForm();
};

const deleteServer = async (id: string) => {
    try {
        messageBoxOpen.value = true;
        await ElMessageBox.confirm("确定要删除此服务器吗？", "警告", {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning",
        });
        await mcpStore.removeServer(id);
    } catch {
        // Cancelled
    } finally {
        messageBoxOpen.value = false;
    }
};

const preventManagerDismissOnOutside = (event: Event) => {
    if (messageBoxOpen.value && !event.defaultPrevented) {
        event.preventDefault();
    }
};

const toggleServer = async (server: McpServer) => {
    if (isServerBusy(server.id)) return;

    const nextEnabled = !server.enabled;

    if (nextEnabled && isStoreToolBlocked(server)) {
        const label = getStoreAccess(server)?.label || "已过期/失效";
        ElMessage.warning(
            `该工具${label}，已被禁用，请在 Glosc Store 续费/恢复后再启用`,
        );
        return;
    }

    toggleActionLabel.value = {
        ...toggleActionLabel.value,
        [server.id]: nextEnabled ? "enable" : "disable",
    };
    togglingServerIds.value = new Set(togglingServerIds.value).add(server.id);

    try {
        await mcpStore.updateServer(server.id, { enabled: nextEnabled });

        if (!nextEnabled) {
            // Hide previous capability results when disabled
            mcpStore.setServerCapability(server.id, null);
            return;
        }

        // Treat "启用" as "启动并刷新能力" to avoid duplicated "启动" button.
        const caps = await McpUtils.getActiveCapabilities({
            ...server,
            enabled: true,
        } as McpServer);
        mcpStore.setServerCapability(server.id, caps);
    } catch (e: any) {
        ElMessage.error(
            `${server.enabled ? "禁用" : "启用"} ${server.name} 失败: ${
                e?.message || String(e)
            }`,
        );
        mcpStore.setServerCapability(server.id, {
            success: false,
            error: e?.message || String(e),
        });
    } finally {
        const next = new Set(togglingServerIds.value);
        next.delete(server.id);
        togglingServerIds.value = next;
    }
};

const testServer = async (server: McpServer) => {
    if (isServerBusy(server.id)) return;
    testingServerIds.value = new Set(testingServerIds.value).add(server.id);
    try {
        const result = await McpUtils.testConnection(server);
        if (result.success) {
            ElMessage.success(`连接 ${server.name} 成功`);
            mcpStore.setServerCapability(server.id, result);
        } else {
            ElMessage.error(`连接 ${server.name} 失败: ${result.error}`);
            mcpStore.setServerCapability(server.id, {
                success: false,
                error: result.error,
            });
        }
    } catch (e) {
        ElMessage.error(`测试 ${server.name} 时出错: ${e}`);
        mcpStore.setServerCapability(server.id, {
            success: false,
            error: String(e),
        });
    } finally {
        const next = new Set(testingServerIds.value);
        next.delete(server.id);
        testingServerIds.value = next;
    }
};

const updateStoreInstalledServer = async (server: McpServer) => {
    if (isServerBusy(server.id)) return;
    if (!isStoreInstalledServer(server)) return;

    updatingServerIds.value = new Set(updatingServerIds.value).add(server.id);
    try {
        await authStore.init();

        const kind = String(getStoreKind(server) || "");
        if (kind === "file" && (!authStore.isLoggedIn || !authStore.token)) {
            ElMessage.warning("更新需要登录 Glosc Store");
            await authStore.startLogin();
            return;
        }

        const res = await updateStoreTool({
            server,
            authToken: authStore.token,
            mcpStore,
        });

        if (!res.updated) {
            ElMessage.success("已是最新版本");
        } else {
            ElMessage.success(`已更新到 ${res.version}`);
        }

        // If enabled, restart + refresh capability snapshot.
        const updated = mcpStore.servers.find((s) => s.id === server.id);
        if (updated && updated.enabled) {
            try {
                await McpUtils.stopServer(updated.id);
            } catch {
                // ignore
            }
            await McpUtils.startServer(updated);
            const caps = await McpUtils.getActiveCapabilities(updated);
            mcpStore.setServerCapability(updated.id, caps);
        }
    } catch (e: any) {
        ElMessage.error(`更新失败：${e?.message || String(e)}`);
    } finally {
        const next = new Set(updatingServerIds.value);
        next.delete(server.id);
        updatingServerIds.value = next;
    }
};

const ensureLoaded = async () => {
    await mcpStore.init();
    await mcpStore.checkConnections();
    loadedOnce.value = true;
};

watch(
    () => uiStore.mcpManagerOpen,
    async (open) => {
        if (!open) return;
        if (!loadedOnce.value) {
            await ensureLoaded();
        } else {
            // Open-time refresh so the state feels up-to-date.
            await mcpStore.checkConnections();
        }
    },
    { immediate: true },
);
</script>

<template>
    <Dialog v-model:open="uiStore.mcpManagerOpen">
        <DialogContent
            class="w-[90vw] md:max-w-225 h-[85vh] flex flex-col"
            @pointer-down-outside="preventManagerDismissOnOutside"
            @interact-outside="preventManagerDismissOnOutside"
        >
            <DialogHeader>
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <DialogTitle>工具管理</DialogTitle>
                        <DialogDescription>
                            配置您的工具（MCP 服务器）。
                        </DialogDescription>
                    </div>
                    <div class="flex items-center gap-2">
                        <Button
                            variant="outline"
                            @click="storeToolBrowserOpen = true"
                        >
                            <Plus class="w-4 h-4 mr-2" />
                            从 Glosc Store 添加
                        </Button>
                        <Button variant="outline" @click="openAddDialog">
                            <Plus class="w-4 h-4 mr-2" />
                            添加工具
                        </Button>
                        <Button
                            variant="ghost"
                            @click="uiStore.closeMcpManager"
                        >
                            关闭
                        </Button>
                    </div>
                </div>
            </DialogHeader>

            <StoreToolBrowserDialog
                v-model:open="storeToolBrowserOpen"
                @installed="() => mcpStore.checkConnections()"
            />

            <div class="flex-1 overflow-y-auto pr-1">
                <VueDraggableNext
                    :list="mcpStore.servers"
                    item-key="id"
                    group="mcp-tools"
                    handle=".drag-handle"
                    tag="div"
                    class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    @end="onSortEnd"
                >
                    <template
                        v-for="server in mcpStore.servers"
                        :key="server.id"
                    >
                        <div
                            class="border rounded-lg bg-card text-card-foreground shadow-sm p-4 flex flex-col"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                    <div
                                        class="flex items-center gap-2 flex-wrap"
                                    >
                                        <div
                                            class="drag-handle text-muted-foreground cursor-grab active:cursor-grabbing select-none"
                                            :class="[
                                                togglingServerIds.size > 0 ||
                                                testingServerIds.size > 0 ||
                                                updatingServerIds.size > 0
                                                    ? 'opacity-40 cursor-not-allowed'
                                                    : '',
                                            ]"
                                            title="拖拽排序"
                                            @click.stop
                                        >
                                            <GripVertical class="w-4 h-4" />
                                        </div>

                                        <div
                                            class="font-semibold truncate max-w-full"
                                        >
                                            {{ server.name }}
                                        </div>

                                        <span
                                            :class="[
                                                'px-2 py-0.5 rounded text-xs',
                                                getServerStateClass(server),
                                            ]"
                                        >
                                            {{ getServerStateLabel(server) }}
                                        </span>

                                        <Badge
                                            v-if="
                                                isStoreInstalledServer(server)
                                            "
                                            variant="outline"
                                        >
                                            Glosc Store
                                        </Badge>
                                        <Badge
                                            v-if="
                                                isStoreInstalledServer(
                                                    server,
                                                ) && getStoreVersion(server)
                                            "
                                            variant="secondary"
                                        >
                                            v{{ getStoreVersion(server) }}
                                        </Badge>
                                        <Badge
                                            v-if="
                                                isStoreInstalledServer(
                                                    server,
                                                ) && getStoreKind(server)
                                            "
                                            variant="outline"
                                        >
                                            {{ getStoreKind(server) }}
                                        </Badge>

                                        <span
                                            v-if="
                                                getStoreAccess(server)
                                                    ?.status === 'expired'
                                            "
                                            class="px-2 py-0.5 rounded text-xs bg-destructive/10 text-destructive"
                                        >
                                            已过期
                                        </span>
                                        <span
                                            v-else-if="
                                                getStoreAccess(server)
                                                    ?.status === 'invalid'
                                            "
                                            class="px-2 py-0.5 rounded text-xs bg-destructive/10 text-destructive"
                                        >
                                            已失效
                                        </span>
                                    </div>

                                    <div
                                        class="text-sm text-muted-foreground mt-2 line-clamp-3"
                                    >
                                        <span
                                            v-if="
                                                isStoreInstalledServer(server)
                                            "
                                        >
                                            {{
                                                getStoreDescription(server) ||
                                                "暂无描述"
                                            }}
                                        </span>
                                        <span v-else>暂无描述</span>
                                    </div>
                                </div>
                            </div>

                            <div
                                class="mt-3 flex flex-wrap items-center justify-end gap-2"
                            >
                                <Button
                                    variant="outline"
                                    size="sm"
                                    @click="toggleServer(server)"
                                    :disabled="isServerBusy(server.id)"
                                >
                                    <Loader2
                                        v-if="togglingServerIds.has(server.id)"
                                        class="w-4 h-4 mr-1 animate-spin"
                                    />
                                    <span
                                        v-if="togglingServerIds.has(server.id)"
                                    >
                                        {{
                                            toggleActionLabel[server.id] ===
                                            "disable"
                                                ? "禁用中"
                                                : "启用中"
                                        }}
                                    </span>
                                    <span v-else>
                                        {{ server.enabled ? "禁用" : "启用" }}
                                    </span>
                                </Button>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    @click="testServer(server)"
                                    :disabled="isServerBusy(server.id)"
                                >
                                    <Loader2
                                        v-if="testingServerIds.has(server.id)"
                                        class="w-4 h-4 mr-1 animate-spin"
                                    />
                                    <Activity v-else class="w-4 h-4 mr-1" />
                                    {{
                                        testingServerIds.has(server.id)
                                            ? "测试中"
                                            : "测试"
                                    }}
                                </Button>

                                <DropdownMenu>
                                    <DropdownMenuTrigger as-child>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            :disabled="isServerBusy(server.id)"
                                        >
                                            <MoreVertical
                                                class="w-4 h-4 mr-1"
                                            />
                                            更多
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="end"
                                        class="w-48"
                                    >
                                        <DropdownMenuLabel
                                            >能力</DropdownMenuLabel
                                        >
                                        <DropdownMenuItem
                                            :disabled="
                                                !mcpStore.serverCapabilities[
                                                    server.id
                                                ]
                                            "
                                            @select="
                                                openCapabilityDialog(
                                                    server.id,
                                                    'tools',
                                                )
                                            "
                                        >
                                            Tools
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            :disabled="
                                                !mcpStore.serverCapabilities[
                                                    server.id
                                                ]
                                            "
                                            @select="
                                                openCapabilityDialog(
                                                    server.id,
                                                    'resources',
                                                )
                                            "
                                        >
                                            Resources
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            :disabled="
                                                !mcpStore.serverCapabilities[
                                                    server.id
                                                ]
                                            "
                                            @select="
                                                openCapabilityDialog(
                                                    server.id,
                                                    'templates',
                                                )
                                            "
                                        >
                                            Templates
                                        </DropdownMenuItem>

                                        <DropdownMenuSeparator />

                                        <DropdownMenuLabel
                                            >管理</DropdownMenuLabel
                                        >
                                        <DropdownMenuItem
                                            :disabled="isServerBusy(server.id)"
                                            @select="openEditDialog(server)"
                                        >
                                            <Edit class="w-4 h-4" />
                                            编辑
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            class="text-destructive focus:text-destructive"
                                            :disabled="isServerBusy(server.id)"
                                            @select="deleteServer(server.id)"
                                        >
                                            <Trash2 class="w-4 h-4" />
                                            删除
                                        </DropdownMenuItem>

                                        <DropdownMenuSeparator />

                                        <DropdownMenuLabel
                                            >Glosc Store</DropdownMenuLabel
                                        >
                                        <DropdownMenuItem
                                            :disabled="
                                                !isStoreInstalledServer(server)
                                            "
                                            @select="
                                                openStoreDetailByServer(server)
                                            "
                                        >
                                            <ExternalLink class="w-4 h-4" />
                                            打开
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            :disabled="
                                                !isStoreInstalledServer(
                                                    server,
                                                ) ||
                                                updatingServerIds.has(server.id)
                                            "
                                            @select="
                                                updateStoreInstalledServer(
                                                    server,
                                                )
                                            "
                                        >
                                            <Loader2
                                                v-if="
                                                    updatingServerIds.has(
                                                        server.id,
                                                    )
                                                "
                                                class="w-4 h-4 animate-spin"
                                            />
                                            <RefreshCw v-else class="w-4 h-4" />
                                            {{
                                                updatingServerIds.has(server.id)
                                                    ? "更新中"
                                                    : "更新"
                                            }}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            :disabled="
                                                !isStoreInstalledServer(server)
                                            "
                                            @select="
                                                openStoreDetailByServer(
                                                    server,
                                                    '#rating',
                                                )
                                            "
                                        >
                                            <Star class="w-4 h-4" />
                                            评价
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </template>
                </VueDraggableNext>

                <div
                    v-if="mcpStore.servers.length === 0"
                    class="text-center py-12 text-muted-foreground"
                >
                    未配置工具。点击“添加工具”开始使用。
                </div>
            </div>

            <!-- Capability dialog (nested) -->
            <Dialog v-model:open="capabilityDialogOpen">
                <DialogContent
                    class="w-[90vw] md:max-w-225 h-[85vh] flex flex-col"
                >
                    <DialogHeader>
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <DialogTitle>
                                    {{
                                        capabilityDialogServer?.name ||
                                        "能力详情"
                                    }}
                                </DialogTitle>
                                <DialogDescription>
                                    Tools / Resources /
                                    Templates（以弹窗形式查看）。
                                </DialogDescription>
                            </div>
                            <div class="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    @click="capabilityDialogOpen = false"
                                >
                                    关闭
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>

                    <div class="flex-1 overflow-y-auto">
                        <div
                            v-if="!capabilityDialogCaps"
                            class="text-sm text-muted-foreground p-4"
                        >
                            暂无能力信息，请先点击“测试”或启用服务器后自动刷新。
                        </div>
                        <McpCapabilityView
                            v-else
                            :server-id="String(capabilityDialogServerId)"
                            :capabilities="capabilityDialogCaps"
                            :initial-tab="capabilityDialogInitialTab"
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <!-- Add/Edit dialog (nested) -->
            <Dialog v-model:open="isDialogOpen">
                <DialogContent class="max-w-2xl">
                    <DialogHeader>
                        <div class="flex items-center justify-between">
                            <DialogTitle>{{
                                editingServer ? "编辑工具" : "添加工具"
                            }}</DialogTitle>
                            <div
                                class="flex items-center gap-2 bg-muted p-1 rounded-md"
                            >
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    :class="[
                                        'h-7 px-3',
                                        inputMode === 'form'
                                            ? 'bg-background shadow-sm'
                                            : 'text-muted-foreground',
                                    ]"
                                    @click="inputMode = 'form'"
                                >
                                    <FileText class="w-4 h-4 mr-1" />
                                    表单
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    :class="[
                                        'h-7 px-3',
                                        inputMode === 'json'
                                            ? 'bg-background shadow-sm'
                                            : 'text-muted-foreground',
                                    ]"
                                    @click="inputMode = 'json'"
                                >
                                    <Code class="w-4 h-4 mr-1" />
                                    JSON
                                </Button>
                            </div>
                        </div>
                        <DialogDescription>
                            配置您的工具（MCP 服务器）。
                        </DialogDescription>
                    </DialogHeader>

                    <div v-if="inputMode === 'form'" class="grid gap-4 py-4">
                        <div class="grid gap-2">
                            <label class="text-sm font-medium">类型</label>
                            <Select v-model="form.type">
                                <SelectTrigger>
                                    <SelectValue placeholder="选择类型" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="stdio">Stdio</SelectItem>
                                    <SelectItem value="http"
                                        >HTTP (SSE)</SelectItem
                                    >
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="grid gap-2">
                            <label class="text-sm font-medium">名称</label>
                            <Input v-model="form.name" placeholder="我的工具" />
                        </div>

                        <template v-if="form.type === 'stdio'">
                            <div class="grid gap-2">
                                <label class="text-sm font-medium">命令</label>
                                <Input
                                    v-model="form.command"
                                    placeholder="node, python, etc."
                                />
                            </div>
                            <div class="grid gap-2">
                                <label class="text-sm font-medium">参数</label>
                                <Input
                                    v-model="form.args"
                                    placeholder="path/to/server.js --arg"
                                />
                            </div>
                            <div class="grid gap-2">
                                <label class="text-sm font-medium"
                                    >环境变量 (JSON)</label
                                >
                                <Textarea
                                    v-model="form.env"
                                    placeholder='{"KEY": "VALUE"}'
                                    rows="4"
                                />
                            </div>
                        </template>

                        <template v-else>
                            <div class="grid gap-2">
                                <label class="text-sm font-medium">URL</label>
                                <Input
                                    v-model="form.url"
                                    placeholder="http://localhost:3000/sse"
                                />
                            </div>
                            <div class="grid gap-2">
                                <label class="text-sm font-medium"
                                    >Headers (JSON)</label
                                >
                                <Textarea
                                    v-model="form.headers"
                                    placeholder='{"Authorization": "Bearer ..."}'
                                    rows="4"
                                />
                            </div>
                        </template>
                    </div>

                    <div
                        v-else
                        class="py-4 h-100 border rounded-md overflow-hidden"
                    >
                        <Codemirror
                            v-model="jsonContent"
                            placeholder="输入服务器配置 JSON..."
                            :style="{ height: '100%' }"
                            :autofocus="true"
                            :indent-with-tab="true"
                            :tab-size="2"
                            :extensions="extensions"
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" @click="isDialogOpen = false"
                            >取消</Button
                        >
                        <Button @click="saveServer">保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DialogContent>
    </Dialog>
</template>
