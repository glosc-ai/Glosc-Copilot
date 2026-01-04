<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useMcpStore } from "@/stores/mcp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    Plus,
    Trash2,
    Edit,
    Activity,
    ArrowLeft,
    Code,
    FileText,
    ChevronDown,
    ChevronUp,
    Loader2,
} from "lucide-vue-next";
import { useRouter } from "vue-router";

import { McpUtils } from "@/utils/McpUtils";
import McpCapabilityView from "@/components/mcp/McpCapabilityView.vue";
import type { McpServer } from "@/utils/interface";
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

const router = useRouter();
const mcpStore = useMcpStore();

const isDialogOpen = ref(false);
const editingServer = ref<McpServer | null>(null);
const inputMode = ref<"form" | "json">("form");
const jsonContent = ref("");

// Test Results State
const expandedServers = ref<Set<string>>(new Set());

// Per-server action loading states
const togglingServerIds = ref<Set<string>>(new Set());
const testingServerIds = ref<Set<string>>(new Set());
const toggleActionLabel = ref<Record<string, "enable" | "disable">>({});

const isServerBusy = (serverId: string) =>
    togglingServerIds.value.has(serverId) ||
    testingServerIds.value.has(serverId);

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
        { label: "type", template: 'type": "stdio"', detail: "Transport type" },
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
                apply: isQuoted ? p.template : `"${p.template}`,
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
        2
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
            2
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
            2
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
        } catch (e) {
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
            2
        );
    } else {
        let headers = {};
        try {
            headers = form.value.headers ? JSON.parse(form.value.headers) : {};
        } catch (e) {
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
            2
        );
    }
};

const stripJsonComments = (json: string) => {
    return json.replace(
        /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
        (m, g) => (g ? "" : m)
    );
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
                configs.push({
                    type: config.type || "stdio",
                    name: name,
                    command: config.command,
                    args: config.args || [],
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
                configs.push({
                    type: config.type || "stdio",
                    name: name,
                    command: config.command,
                    args: config.args || [],
                    env: config.env || {},
                    url: config.url,
                    headers: config.headers,
                });
            }
            if (configs.length > 0) return configs;
        }

        // Handle direct server config
        return [
            {
                type: data.type || (data.url ? "http" : "stdio"),
                name: data.name,
                command: data.command,
                args: data.args || [],
                env: data.env || {},
                url: data.url,
                headers: data.headers || {},
            },
        ];
    } catch (e) {
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
            serverData.command = form.value.command;
            serverData.args = form.value.args.split(" ").filter(Boolean);
            try {
                serverData.env = form.value.env
                    ? JSON.parse(form.value.env)
                    : {};
            } catch (e) {
                ElMessage.error("环境变量必须是有效的 JSON");
                return;
            }
        } else {
            serverData.url = form.value.url;
            try {
                serverData.headers = form.value.headers
                    ? JSON.parse(form.value.headers)
                    : {};
            } catch (e) {
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
        await ElMessageBox.confirm("确定要删除此服务器吗？", "警告", {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning",
        });
        await mcpStore.removeServer(id);
    } catch {
        // Cancelled
    }
};

const toggleServer = async (server: McpServer) => {
    if (isServerBusy(server.id)) return;

    const nextEnabled = !server.enabled;
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
            const newSet = new Set(expandedServers.value);
            newSet.delete(server.id);
            expandedServers.value = newSet;
            return;
        }

        // Treat "启用" as "启动并刷新能力" to avoid duplicated "启动" button.
        const caps = await McpUtils.getActiveCapabilities({
            ...server,
            enabled: true,
        } as McpServer);
        mcpStore.setServerCapability(server.id, caps);
        const newSet = new Set(expandedServers.value);
        newSet.add(server.id);
        expandedServers.value = newSet;
    } catch (e: any) {
        ElMessage.error(
            `${server.enabled ? "禁用" : "启用"} ${server.name} 失败: ${
                e?.message || String(e)
            }`
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

const toggleServerExpansion = (serverId: string) => {
    const newSet = new Set(expandedServers.value);
    if (newSet.has(serverId)) {
        newSet.delete(serverId);
    } else {
        newSet.add(serverId);
    }
    expandedServers.value = newSet;
};

const testServer = async (server: McpServer) => {
    console.log("Testing server:", server);
    if (isServerBusy(server.id)) return;
    testingServerIds.value = new Set(testingServerIds.value).add(server.id);
    try {
        const result = await McpUtils.testConnection(server);
        if (result.success) {
            ElMessage.success(`连接 ${server.name} 成功`);
            mcpStore.setServerCapability(server.id, result);
            // Auto expand on success
            const newSet = new Set(expandedServers.value);
            newSet.add(server.id);
            expandedServers.value = newSet;
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

onMounted(async () => {
    await mcpStore.init();
    // 只做能力刷新，不自动修改启用/禁用状态
    await mcpStore.checkConnections();
});
</script>

<template>
    <div class="container p-6">
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-4">
                <Button variant="ghost" size="icon" @click="router.back()">
                    <ArrowLeft class="w-4 h-4" />
                </Button>
                <h1 class="text-2xl font-bold">MCP 服务器管理</h1>
            </div>
            <Button @click="openAddDialog">
                <Plus class="w-4 h-4 mr-2" />
                添加服务器
            </Button>
        </div>

        <div class="grid gap-4">
            <div
                v-for="server in mcpStore.servers"
                :key="server.id"
                class="border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden"
            >
                <div class="p-4 flex items-center justify-between">
                    <div>
                        <div class="flex items-center gap-2">
                            <h3 class="font-semibold text-lg">
                                {{ server.name }}
                            </h3>
                            <span
                                :class="[
                                    'px-2 py-0.5 rounded text-xs',
                                    getServerStateClass(server),
                                ]"
                            >
                                {{ getServerStateLabel(server) }}
                            </span>
                        </div>
                        <p class="text-sm text-muted-foreground mt-1">
                            <span v-if="server.type === 'stdio'">
                                {{ server.command }} {{ server.args.join(" ") }}
                            </span>
                            <span v-else-if="server.type === 'http'">
                                {{ server.url }}
                            </span>
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
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
                            <span v-if="togglingServerIds.has(server.id)">
                                {{
                                    toggleActionLabel[server.id] === "disable"
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
                        <Button
                            variant="ghost"
                            size="icon"
                            @click="openEditDialog(server)"
                            :disabled="isServerBusy(server.id)"
                        >
                            <Edit class="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="text-destructive hover:text-destructive"
                            @click="deleteServer(server.id)"
                            :disabled="isServerBusy(server.id)"
                        >
                            <Trash2 class="w-4 h-4" />
                        </Button>
                        <Button
                            v-if="mcpStore.serverCapabilities[server.id]"
                            variant="ghost"
                            size="icon"
                            @click="toggleServerExpansion(server.id)"
                            :disabled="isServerBusy(server.id)"
                        >
                            <component
                                :is="
                                    expandedServers.has(server.id)
                                        ? ChevronUp
                                        : ChevronDown
                                "
                                class="w-4 h-4"
                            />
                        </Button>
                    </div>
                </div>

                <!-- Expanded Details -->
                <McpCapabilityView
                    v-if="
                        expandedServers.has(server.id) &&
                        mcpStore.serverCapabilities[server.id]
                    "
                    :server-id="server.id"
                    :capabilities="mcpStore.serverCapabilities[server.id]"
                />
            </div>

            <div
                v-if="mcpStore.servers.length === 0"
                class="text-center py-12 text-muted-foreground"
            >
                未配置 MCP 服务器。点击“添加服务器”开始使用。
            </div>
        </div>

        <Dialog v-model:open="isDialogOpen">
            <DialogContent class="max-w-2xl">
                <DialogHeader>
                    <div class="flex items-center justify-between">
                        <DialogTitle>{{
                            editingServer ? "编辑服务器" : "添加服务器"
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
                        配置您的模型上下文协议 (MCP) 服务器。
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
                                <SelectItem value="http">HTTP (SSE)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div class="grid gap-2">
                        <label class="text-sm font-medium">名称</label>
                        <Input
                            v-model="form.name"
                            placeholder="我的 MCP 服务器"
                        />
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
    </div>
</template>
