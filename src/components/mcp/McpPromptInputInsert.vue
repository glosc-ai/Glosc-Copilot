<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    FileJson,
    LayoutTemplate,
    FileText,
    Loader2,
    Search,
} from "lucide-vue-next";

import type { McpServer } from "@/utils/interface";
import { McpUtils } from "@/utils/McpUtils";
import { usePromptInput } from "@/components/ai-elements/prompt-input/context";

import { buildMcpResourceBlock } from "@/utils/InlineCitationUtils";

type TabKey = "resources" | "templates" | "prompts";

type ResourceRow = {
    server: McpServer;
    uri: string;
    name?: string;
    mimeType?: string;
};

type TemplateRow = {
    server: McpServer;
    uriTemplate: string;
    name?: string;
    description?: string;
};

type PromptRow = {
    server: McpServer;
    name: string;
    description?: string;
    arguments?: PromptArgument[];
};

type PromptArgument = {
    name: string;
    description?: string;
    required?: boolean;
    schema?: any;
};

const props = withDefaults(
    defineProps<{
        servers: McpServer[];
        enabledServerIds: string[];
        disabled?: boolean;
    }>(),
    {
        disabled: false,
    },
);

const { textInput, setTextInput } = usePromptInput();

const open = ref(false);
const activeTab = ref<TabKey>("resources");
const search = ref("");

const loading = ref(false);

const templateUriDialogOpen = ref(false);
const templateUri = ref("");
const templateUriServer = ref<McpServer | null>(null);

const enabledServers = computed(() => {
    const enabledIdSet = new Set(props.enabledServerIds || []);
    return (props.servers || []).filter((s) => enabledIdSet.has(s.id));
});

const resources = ref<ResourceRow[]>([]);
const templates = ref<TemplateRow[]>([]);
const prompts = ref<PromptRow[]>([]);

const promptArgsDialogOpen = ref(false);
const promptArgsPrompt = ref<PromptRow | null>(null);
const promptArgValues = ref<Record<string, any>>({});
const promptArgErrors = ref<Record<string, string>>({});

function appendToInput(nextText: string) {
    const current = String(textInput.value || "");
    const trimmed = current.trimEnd();
    const prefix = trimmed.length ? `${trimmed}\n\n` : "";
    setTextInput(prefix + nextText);
}

function getNextResourceCitationNumber(): number {
    const current = String(textInput.value || "");
    const matches = current.match(/\[\[MCP_RESOURCE_META:/g);
    return (matches?.length || 0) + 1;
}

function isTextLikeMime(mimeType?: string) {
    const mt = String(mimeType || "").toLowerCase();
    if (!mt) return true;
    return (
        mt.startsWith("text/") ||
        mt.includes("json") ||
        mt.includes("xml") ||
        mt.includes("yaml") ||
        mt.includes("markdown")
    );
}

function resourceReadResultToText(payload: any) {
    const items: any[] = payload?.contents || payload?.content || [];
    if (!Array.isArray(items) || items.length === 0) return "";

    const first = items[0];
    if (typeof first?.text === "string") return first.text;

    // Some servers may return { blob: "base64..." } or similar
    if (typeof first?.blob === "string") {
        return first.blob;
    }

    return "";
}

function promptResultToText(payload: any) {
    const messages = payload?.messages;
    if (!Array.isArray(messages) || messages.length === 0) return "";

    const parts: string[] = [];
    for (const m of messages) {
        const role = m?.role ? String(m.role) : "assistant";
        const content = m?.content;
        if (typeof content === "string") {
            parts.push(`[${role}] ${content}`);
            continue;
        }
        if (Array.isArray(content)) {
            const text = content
                .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
                .filter(Boolean)
                .join("\n");
            if (text) parts.push(`[${role}] ${text}`);
        }
    }

    return parts.join("\n\n").trim();
}

function normalizePromptArguments(raw: any): PromptArgument[] {
    const args = raw?.arguments;
    if (!Array.isArray(args)) return [];
    return args
        .map((a: any) => {
            const name = a?.name ? String(a.name) : "";
            if (!name) return null;
            return {
                name,
                description: a?.description,
                required: Boolean(a?.required),
                schema: a?.schema,
            } satisfies PromptArgument;
        })
        .filter(Boolean) as PromptArgument[];
}

function schemaType(schema: any): string {
    const t = schema?.type;
    if (typeof t === "string" && t) return t;
    if (Array.isArray(schema?.type) && schema.type.length > 0) {
        // Prefer non-null type if available
        const nonNull = schema.type.find((x: any) => x && x !== "null");
        if (typeof nonNull === "string" && nonNull) return nonNull;
    }
    if (Array.isArray(schema?.enum)) return "string";
    return "string";
}

function isEnumString(schema: any): schema is { enum: string[] } {
    const e = schema?.enum;
    return (
        Array.isArray(e) &&
        e.length > 0 &&
        e.every((x) => typeof x === "string")
    );
}

function initPromptArgValues(row: PromptRow) {
    const next: Record<string, any> = {};
    for (const arg of row.arguments || []) {
        const t = schemaType(arg.schema);
        const def = arg?.schema?.default;

        if (t === "boolean") {
            next[arg.name] = typeof def === "boolean" ? def : false;
            continue;
        }

        if ((t === "object" || t === "array") && def != null) {
            try {
                next[arg.name] = JSON.stringify(def, null, 2);
            } catch {
                next[arg.name] = "";
            }
            continue;
        }

        if (def != null) {
            next[arg.name] = String(def);
        } else {
            next[arg.name] = "";
        }
    }
    promptArgValues.value = next;
    promptArgErrors.value = {};
}

function openPromptArgs(row: PromptRow) {
    promptArgsPrompt.value = row;
    initPromptArgValues(row);
    promptArgsDialogOpen.value = true;
}

function buildPromptArgs(
    row: PromptRow,
): { ok: true; args: Record<string, any> } | { ok: false } {
    const errors: Record<string, string> = {};
    const args: Record<string, any> = {};

    for (const arg of row.arguments || []) {
        const t = schemaType(arg.schema);
        const raw = promptArgValues.value[arg.name];

        if (t === "boolean") {
            args[arg.name] = Boolean(raw);
            continue;
        }

        const rawText =
            typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();

        if (arg.required && !rawText) {
            errors[arg.name] = "必填";
            continue;
        }

        if (!rawText) {
            // Optional + empty => omit
            continue;
        }

        if (t === "number" || t === "integer") {
            const n = Number(rawText);
            if (!Number.isFinite(n)) {
                errors[arg.name] = "需要数字";
                continue;
            }
            args[arg.name] = t === "integer" ? Math.trunc(n) : n;
            continue;
        }

        if (t === "object" || t === "array") {
            try {
                args[arg.name] = JSON.parse(rawText);
            } catch {
                errors[arg.name] = "需要合法 JSON";
            }
            continue;
        }

        // string / others
        args[arg.name] = rawText;
    }

    promptArgErrors.value = errors;
    if (Object.keys(errors).length > 0) return { ok: false };
    return { ok: true, args };
}

async function loadAll() {
    const list = enabledServers.value;
    resources.value = [];
    templates.value = [];
    prompts.value = [];

    if (!list.length) return;

    loading.value = true;
    try {
        const capsList = await Promise.all(
            list.map(async (server) => {
                try {
                    return await McpUtils.getActiveCapabilities(server);
                } catch (e) {
                    console.log("Failed to load caps", server.name, e);
                    return null;
                }
            }),
        );

        const nextResources: ResourceRow[] = [];
        const nextTemplates: TemplateRow[] = [];
        const nextPrompts: PromptRow[] = [];

        for (let i = 0; i < list.length; i++) {
            const server = list[i];
            const caps: any = capsList[i];
            if (!caps || caps.success === false) continue;

            for (const r of caps?.resources?.resources || []) {
                if (!r?.uri) continue;
                nextResources.push({
                    server,
                    uri: String(r.uri),
                    name: r.name,
                    mimeType: r.mimeType,
                });
            }

            for (const t of caps?.templates?.resourceTemplates || []) {
                if (!t?.uriTemplate) continue;
                nextTemplates.push({
                    server,
                    uriTemplate: String(t.uriTemplate),
                    name: t.name,
                    description: t.description,
                });
            }

            for (const p of caps?.prompts?.prompts || []) {
                if (!p?.name) continue;
                nextPrompts.push({
                    server,
                    name: String(p.name),
                    description: p.description,
                    arguments: normalizePromptArguments(p),
                });
            }
        }

        resources.value = nextResources;
        templates.value = nextTemplates;
        prompts.value = nextPrompts;
    } finally {
        loading.value = false;
    }
}

watch(open, async (val) => {
    if (!val) return;
    await loadAll();
});

const filteredResources = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return resources.value;
    return resources.value.filter((r) => {
        return (
            String(r.name || "")
                .toLowerCase()
                .includes(q) ||
            String(r.uri || "")
                .toLowerCase()
                .includes(q) ||
            String(r.server?.name || "")
                .toLowerCase()
                .includes(q)
        );
    });
});

const filteredTemplates = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return templates.value;
    return templates.value.filter((t) => {
        return (
            String(t.name || "")
                .toLowerCase()
                .includes(q) ||
            String(t.uriTemplate || "")
                .toLowerCase()
                .includes(q) ||
            String(t.server?.name || "")
                .toLowerCase()
                .includes(q)
        );
    });
});

const filteredPrompts = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return prompts.value;
    return prompts.value.filter((p) => {
        return (
            String(p.name || "")
                .toLowerCase()
                .includes(q) ||
            String(p.description || "")
                .toLowerCase()
                .includes(q) ||
            String(p.server?.name || "")
                .toLowerCase()
                .includes(q)
        );
    });
});

async function handleInsertResource(row: ResourceRow) {
    try {
        loading.value = true;
        const payload = await McpUtils.readResource(row.server, row.uri);
        const text = resourceReadResultToText(payload);

        const mime = row.mimeType || "text/plain";
        const number = getNextResourceCitationNumber();
        const bodyText =
            text && isTextLikeMime(mime)
                ? text
                : "(该资源不是文本或无法解析为文本内容)";

        const block = buildMcpResourceBlock({
            number,
            meta: {
                kind: "mcp-resource",
                serverId: row.server.id,
                serverName: row.server.name,
                uri: row.uri,
                name: row.name || row.uri,
                mimeType: mime,
            },
            content: bodyText,
        });

        const visible = `已引用 MCP 资源：${row.name || row.uri} [${number}]`;
        appendToInput(`${block}\n\n${visible}`);

        open.value = false;
    } catch (e: any) {
        ElMessage.error(e?.message || "读取资源失败");
    } finally {
        loading.value = false;
    }
}

function openTemplateUriDialog(row: TemplateRow) {
    templateUriServer.value = row.server;
    templateUri.value = row.uriTemplate;
    templateUriDialogOpen.value = true;
}

async function confirmTemplateUriRead() {
    const server = templateUriServer.value;
    const uri = String(templateUri.value || "").trim();
    if (!server || !uri) return;

    templateUriDialogOpen.value = false;

    await handleInsertResource({
        server,
        uri,
        name: "resource-template",
    });
}

async function handleInsertPrompt(row: PromptRow) {
    if (row.arguments && row.arguments.length > 0) {
        // Close list dialog first to avoid nested dialogs.
        open.value = false;
        openPromptArgs(row);
        return;
    }
    try {
        loading.value = true;
        const payload = await McpUtils.getPrompt(row.server, row.name);
        const text = promptResultToText(payload);

        const header = `# MCP Prompt\n- Server: ${row.server.name}\n- Name: ${row.name}\n\n`;
        appendToInput(
            header +
                (text ||
                    "(该 prompt 未返回可渲染文本；可能需要参数或服务端不支持 getPrompt)"),
        );

        open.value = false;
    } catch (e: any) {
        ElMessage.error(e?.message || "获取提示词模板失败");
    } finally {
        loading.value = false;
    }
}

async function submitPromptWithArgs() {
    const row = promptArgsPrompt.value;
    if (!row) return;

    const built = buildPromptArgs(row);
    if (!built.ok) return;

    try {
        loading.value = true;
        const payload = await McpUtils.getPrompt(
            row.server,
            row.name,
            built.args,
        );
        const text = promptResultToText(payload);

        const header = `# MCP Prompt\n- Server: ${row.server.name}\n- Name: ${row.name}\n\n`;
        appendToInput(
            header +
                (text ||
                    "(该 prompt 未返回可渲染文本；可能服务端返回的是非文本消息或需要不同参数)"),
        );

        promptArgsDialogOpen.value = false;
        promptArgsPrompt.value = null;
    } catch (e: any) {
        ElMessage.error(e?.message || "获取提示词模板失败");
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <PromptInputButton @click="open = true" title="资源/模板">
        <FileJson class="w-4 h-4" />
        <span>资源/模板</span>
    </PromptInputButton>

    <Dialog v-model:open="open">
        <DialogContent
            class="w-[92vw] max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
        >
            <DialogHeader>
                <DialogTitle
                    >插入 MCP Resources / Templates / Prompts</DialogTitle
                >
                <DialogDescription class="sr-only">
                    从已启用的 MCP Server
                    中选择资源、资源模板或提示词，并把内容插入到输入框。
                </DialogDescription>
            </DialogHeader>

            <div
                v-if="enabledServers.length === 0"
                class="text-sm text-muted-foreground"
            >
                当前会话未启用任何 MCP Server。
            </div>

            <div v-else class="flex flex-col gap-3 flex-1 overflow-hidden">
                <div class="flex items-center gap-2">
                    <div class="relative flex-1">
                        <Search
                            class="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            v-model="search"
                            class="pl-8"
                            placeholder="搜索：server / name / uri"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        :disabled="loading"
                        @click="loadAll"
                    >
                        <Loader2
                            v-if="loading"
                            class="w-4 h-4 mr-2 animate-spin"
                        />
                        刷新
                    </Button>
                </div>

                <div class="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        :class="
                            activeTab === 'resources'
                                ? 'bg-background shadow-sm font-medium'
                                : 'text-muted-foreground'
                        "
                        @click="activeTab = 'resources'"
                    >
                        Resources ({{ resources.length }})
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        :class="
                            activeTab === 'templates'
                                ? 'bg-background shadow-sm font-medium'
                                : 'text-muted-foreground'
                        "
                        @click="activeTab = 'templates'"
                    >
                        Templates ({{ templates.length }})
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        :class="
                            activeTab === 'prompts'
                                ? 'bg-background shadow-sm font-medium'
                                : 'text-muted-foreground'
                        "
                        @click="activeTab = 'prompts'"
                    >
                        Prompts ({{ prompts.length }})
                    </Button>
                </div>

                <div
                    v-if="activeTab === 'resources'"
                    class="flex-1 overflow-hidden"
                >
                    <div class="h-[52vh] overflow-y-auto pr-2">
                        <div
                            v-if="!filteredResources.length"
                            class="text-sm text-muted-foreground py-6 text-center"
                        >
                            未发现资源
                        </div>
                        <div
                            v-for="r in filteredResources"
                            :key="`${r.server.id}::${r.uri}`"
                            class="border rounded-md p-3 mb-2"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <div class="font-medium truncate">
                                        {{ r.name || r.uri }}
                                    </div>
                                    <div
                                        class="text-xs text-muted-foreground truncate"
                                    >
                                        {{ r.server.name }} ·
                                        {{ r.mimeType || "Unknown" }}
                                    </div>
                                    <div
                                        class="text-xs font-mono text-muted-foreground break-all mt-1"
                                    >
                                        {{ r.uri }}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    :disabled="loading"
                                    @click="handleInsertResource(r)"
                                    >插入</Button
                                >
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    v-else-if="activeTab === 'templates'"
                    class="flex-1 overflow-hidden"
                >
                    <div class="h-[52vh] overflow-y-auto pr-2">
                        <div
                            v-if="!filteredTemplates.length"
                            class="text-sm text-muted-foreground py-6 text-center"
                        >
                            未发现模板
                        </div>
                        <div
                            v-for="t in filteredTemplates"
                            :key="`${t.server.id}::${t.uriTemplate}`"
                            class="border rounded-md p-3 mb-2"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <div class="font-medium truncate">
                                        {{ t.name || t.uriTemplate }}
                                    </div>
                                    <div
                                        class="text-xs text-muted-foreground truncate"
                                    >
                                        {{ t.server.name }}
                                    </div>
                                    <div
                                        class="text-xs font-mono text-muted-foreground break-all mt-1"
                                    >
                                        {{ t.uriTemplate }}
                                    </div>
                                    <div
                                        v-if="t.description"
                                        class="text-xs text-muted-foreground mt-1"
                                    >
                                        {{ t.description }}
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    :disabled="loading"
                                    @click="openTemplateUriDialog(t)"
                                >
                                    <LayoutTemplate class="w-4 h-4 mr-2" />
                                    填写 URI
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    v-else-if="activeTab === 'prompts'"
                    class="flex-1 overflow-hidden"
                >
                    <div class="h-[52vh] overflow-y-auto pr-2">
                        <div
                            v-if="!filteredPrompts.length"
                            class="text-sm text-muted-foreground py-6 text-center"
                        >
                            未发现提示词模板
                        </div>
                        <div
                            v-for="p in filteredPrompts"
                            :key="`${p.server.id}::${p.name}`"
                            class="border rounded-md p-3 mb-2"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <div class="font-medium truncate">
                                        {{ p.name }}
                                    </div>
                                    <div
                                        class="text-xs text-muted-foreground truncate"
                                    >
                                        {{ p.server.name }}
                                    </div>
                                    <div
                                        v-if="p.description"
                                        class="text-xs text-muted-foreground mt-1"
                                    >
                                        {{ p.description }}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    :disabled="loading"
                                    @click="handleInsertPrompt(p)"
                                >
                                    <FileText class="w-4 h-4 mr-2" />
                                    插入
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="templateUriDialogOpen">
        <DialogContent class="w-[92vw] max-w-xl">
            <DialogHeader>
                <DialogTitle>读取 Resource Template</DialogTitle>
                <DialogDescription class="sr-only">
                    输入要读取的资源 URI（可基于模板替换参数）并插入到输入框。
                </DialogDescription>
            </DialogHeader>
            <div class="space-y-3">
                <div class="text-sm text-muted-foreground">
                    请输入要读取的 URI（可在模板基础上替换参数）。
                </div>
                <Input v-model="templateUri" placeholder="mcp://..." />
                <div class="flex justify-end gap-2">
                    <Button
                        variant="outline"
                        @click="templateUriDialogOpen = false"
                        >取消</Button
                    >
                    <Button
                        :disabled="loading || !templateUri.trim()"
                        @click="confirmTemplateUriRead"
                        >读取并插入</Button
                    >
                </div>
            </div>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="promptArgsDialogOpen">
        <DialogContent
            class="w-[92vw] max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        >
            <DialogHeader>
                <DialogTitle>
                    Prompt 参数：{{ promptArgsPrompt?.name || "" }}
                </DialogTitle>
                <DialogDescription class="sr-only">
                    根据 Prompt 的参数 schema 填写参数，然后获取 Prompt
                    内容并插入到输入框。
                </DialogDescription>
            </DialogHeader>

            <div v-if="!promptArgsPrompt" class="text-sm text-muted-foreground">
                未选择 Prompt
            </div>

            <div v-else class="flex-1 overflow-y-auto pr-1 space-y-3">
                <div class="text-xs text-muted-foreground">
                    Server：{{ promptArgsPrompt.server.name }}
                </div>

                <div
                    v-for="arg in promptArgsPrompt.arguments"
                    :key="arg.name"
                    class="border rounded-md p-3"
                >
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="font-medium">
                                {{ arg.name }}
                                <span
                                    v-if="arg.required"
                                    class="text-destructive text-xs ml-1"
                                    >*</span
                                >
                            </div>
                            <div
                                v-if="arg.description"
                                class="text-xs text-muted-foreground mt-1"
                            >
                                {{ arg.description }}
                            </div>
                        </div>
                        <div
                            v-if="promptArgErrors[arg.name]"
                            class="text-xs text-destructive"
                        >
                            {{ promptArgErrors[arg.name] }}
                        </div>
                    </div>

                    <div class="mt-2">
                        <!-- enum (string) -->
                        <Select
                            v-if="isEnumString(arg.schema)"
                            v-model="promptArgValues[arg.name]"
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="请选择" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem
                                    v-for="opt in arg.schema.enum"
                                    :key="opt"
                                    :value="opt"
                                >
                                    {{ opt }}
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        <!-- boolean -->
                        <label
                            v-else-if="schemaType(arg.schema) === 'boolean'"
                            class="flex items-center gap-2 text-sm"
                        >
                            <input
                                type="checkbox"
                                class="h-4 w-4"
                                v-model="promptArgValues[arg.name]"
                            />
                            <span>启用</span>
                        </label>

                        <!-- object/array json -->
                        <Textarea
                            v-else-if="
                                ['object', 'array'].includes(
                                    schemaType(arg.schema),
                                )
                            "
                            v-model="promptArgValues[arg.name]"
                            class="min-h-24 font-mono text-xs"
                            placeholder="请输入 JSON"
                        />

                        <!-- number/integer/string -->
                        <Input
                            v-else
                            v-model="promptArgValues[arg.name]"
                            :type="
                                ['number', 'integer'].includes(
                                    schemaType(arg.schema),
                                )
                                    ? 'number'
                                    : 'text'
                            "
                            :placeholder="arg.schema?.description || '请输入'"
                        />

                        <div
                            v-if="
                                arg.schema &&
                                (arg.schema.type || arg.schema.enum)
                            "
                            class="text-[11px] text-muted-foreground mt-1"
                        >
                            类型：{{ schemaType(arg.schema) }}
                            <template v-if="arg.schema.default != null"
                                >；默认：{{
                                    String(arg.schema.default)
                                }}</template
                            >
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex justify-end gap-2 pt-2">
                <Button
                    variant="outline"
                    :disabled="loading"
                    @click="promptArgsDialogOpen = false"
                    >取消</Button
                >
                <Button :disabled="loading" @click="submitPromptWithArgs">
                    <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
                    获取并插入
                </Button>
            </div>
        </DialogContent>
    </Dialog>
</template>
