<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed, ref } from "vue";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToolEnvelope = {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
    structuredContent?: unknown;
};

const props = defineProps<{
    toolType?: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
    class?: HTMLAttributes["class"];
}>();

const rawOpen = ref(false);
const paramsRawOpen = ref(false);
const contentOpen = ref(false);
const editsOpen = ref(false);

function tryParseJson(value: unknown): unknown {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function extractEnvelopePayload(value: unknown): unknown {
    const parsed = tryParseJson(value);
    const v = parsed as any;

    if (v && typeof v === "object") {
        // 1) 优先 structuredContent
        if (v.structuredContent !== undefined) return v.structuredContent;

        // 2) content[0].text 可能是 JSON 字符串/纯文本
        const firstText =
            Array.isArray(v.content) &&
            v.content.length > 0 &&
            typeof v.content[0]?.text === "string"
                ? (v.content[0].text as string)
                : null;
        if (firstText) return tryParseJson(firstText);
    }

    return parsed;
}

function scrubDeep(value: unknown, depth = 0): unknown {
    if (depth > 6) return value;
    if (Array.isArray(value)) {
        return value.map((item) => scrubDeep(item, depth + 1));
    }
    if (!value || typeof value !== "object") return value;

    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
        // 防止 base64/大文本把 UI 撑爆
        if (typeof val === "string") {
            const shouldScrubKey =
                key === "content" ||
                key === "finalContent" ||
                key === "fileContent" ||
                key === "base64" ||
                key === "data";
            if (shouldScrubKey && val.length > 2000) {
                next[key] = `（已隐藏：内容长度 ${val.length}）`;
                continue;
            }
            if (!shouldScrubKey && val.length > 8000) {
                next[key] = `（已隐藏：内容长度 ${val.length}）`;
                continue;
            }
        }
        next[key] = scrubDeep(val, depth + 1);
    }
    return next;
}

const toolName = computed(() => {
    const t = props.toolType || "";
    return t.startsWith("tool-") ? t.slice("tool-".length) : t;
});

const parsedInput = computed(() => extractEnvelopePayload(props.input));
const parsedOutput = computed(() => extractEnvelopePayload(props.output));

const inputEnv = computed(() => tryParseJson(props.input) as ToolEnvelope);
const outputEnv = computed(() => tryParseJson(props.output) as ToolEnvelope);

const okState = computed(() => {
    if (props.errorText) return false;
    const out = parsedOutput.value as any;
    if (out && typeof out === "object" && typeof out.ok === "boolean")
        return out.ok;
    const env = outputEnv.value;
    if (env && typeof env === "object" && typeof env.isError === "boolean")
        return !env.isError;
    return undefined;
});

const scrubbedJson = computed(() => {
    const v = scrubDeep(outputEnv.value);
    if (typeof v === "string") return v;
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
});

const scrubbedParamsJson = computed(() => {
    const v = scrubDeep(inputEnv.value);
    if (typeof v === "string") return v;
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
});

type KvRow = { label: string; value: string; mono?: boolean };

function formatMaybeList(list: unknown[], max = 3): string {
    if (!Array.isArray(list) || list.length === 0) return "无";
    const preview = list
        .slice(0, max)
        .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
        .join("\n");
    return list.length > max
        ? `${preview}\n...（共 ${list.length} 条）`
        : preview;
}

const paramsRows = computed<KvRow[]>(() => {
    const v = parsedInput.value as any;
    const rows: KvRow[] = [];
    const name = toolName.value;

    // 通用字段
    if (typeof v?.path === "string")
        rows.push({ label: "path", value: v.path, mono: true });
    if (Array.isArray(v?.paths))
        rows.push({
            label: "paths",
            value: `${v.paths.length} 条`,
            mono: false,
        });
    if (typeof v?.head === "number")
        rows.push({ label: "head", value: String(v.head) });
    if (typeof v?.tail === "number")
        rows.push({ label: "tail", value: String(v.tail) });
    if (typeof v?.source === "string")
        rows.push({ label: "source", value: v.source, mono: true });
    if (typeof v?.destination === "string")
        rows.push({ label: "destination", value: v.destination, mono: true });
    if (typeof v?.pattern === "string")
        rows.push({ label: "pattern", value: v.pattern });
    if (Array.isArray(v?.excludePatterns))
        rows.push({
            label: "excludePatterns",
            value: formatMaybeList(v.excludePatterns),
            mono: true,
        });
    if (typeof v?.sortBy === "string")
        rows.push({ label: "sortBy", value: v.sortBy });
    if (typeof v?.dryRun === "boolean")
        rows.push({ label: "dryRun", value: yn(v.dryRun) });

    // write_file
    if (name === "write_file" && typeof v?.content === "string") {
        rows.push({ label: "content", value: `长度 ${v.content.length}` });
    }

    // edit_file
    if (name === "edit_file" && Array.isArray(v?.edits)) {
        const edits = v.edits as any[];
        rows.push({ label: "edits", value: `${edits.length} 条` });
        const first = edits[0];
        if (first && typeof first === "object") {
            if (typeof first.oldText === "string")
                rows.push({
                    label: "oldText",
                    value: `长度 ${first.oldText.length}`,
                });
            if (typeof first.newText === "string")
                rows.push({
                    label: "newText",
                    value: `长度 ${first.newText.length}`,
                });
        }
    }

    // read_multiple_files
    if (name === "read_multiple_files" && Array.isArray(v?.paths)) {
        rows.push({
            label: "pathsPreview",
            value: formatMaybeList(v.paths, 5),
            mono: true,
        });
    }

    // list_allowed_directories
    if (name === "list_allowed_directories") {
        // 该工具通常无参数
        if (rows.length === 0) rows.push({ label: "(none)", value: "无参数" });
    }

    return rows;
});

const resultRows = computed<KvRow[]>(() => {
    const out = parsedOutput.value as any;
    const rows: KvRow[] = [];
    const name = toolName.value;

    // 通用 ok / path
    if (typeof out?.ok === "boolean")
        rows.push({ label: "ok", value: yn(out.ok) });
    if (typeof out?.path === "string")
        rows.push({ label: "path", value: out.path, mono: true });
    if (typeof out?.action === "string")
        rows.push({ label: "action", value: out.action });
    if (typeof out?.existedBefore === "boolean")
        rows.push({ label: "existedBefore", value: yn(out.existedBefore) });
    if (typeof out?.bytesWritten === "number")
        rows.push({ label: "bytesWritten", value: String(out.bytesWritten) });
    if (typeof out?.bytesRead === "number")
        rows.push({ label: "bytesRead", value: String(out.bytesRead) });

    // read_text_file / read_file
    if (
        (name === "read_text_file" || name === "read_file") &&
        typeof out === "string"
    ) {
        rows.push({ label: "text", value: `长度 ${out.length}` });
    }

    // read_media_file
    if (name === "read_media_file") {
        if (typeof out?.mimeType === "string")
            rows.push({ label: "mimeType", value: out.mimeType });
        if (typeof out?.mediaType === "string")
            rows.push({ label: "mediaType", value: out.mediaType });
        if (typeof out?.base64 === "string")
            rows.push({ label: "base64", value: `长度 ${out.base64.length}` });
    }

    // read_multiple_files
    if (name === "read_multiple_files") {
        const arr = Array.isArray(out)
            ? out
            : Array.isArray(out?.files)
              ? out.files
              : null;
        if (Array.isArray(arr))
            rows.push({ label: "files", value: `${arr.length} 条` });
    }

    // search_files
    if (name === "search_files") {
        const arr = Array.isArray(out)
            ? out
            : Array.isArray(out?.matches)
              ? out.matches
              : null;
        if (Array.isArray(arr))
            rows.push({ label: "matches", value: `${arr.length} 条` });
    }

    // directory_tree
    if (name === "directory_tree") {
        const countNodes = (node: any): number => {
            if (!node || typeof node !== "object") return 0;
            const children = Array.isArray(node.children) ? node.children : [];
            return (
                1 +
                children.reduce((sum: any, c: any) => sum + countNodes(c), 0)
            );
        };
        if (out && typeof out === "object")
            rows.push({ label: "nodes", value: String(countNodes(out)) });
    }

    // get_file_info
    if (name === "get_file_info") {
        if (typeof out?.type === "string")
            rows.push({ label: "type", value: out.type });
        if (typeof out?.size === "number")
            rows.push({ label: "size", value: String(out.size) });
        if (typeof out?.modifiedTime === "string")
            rows.push({ label: "modified", value: out.modifiedTime });
        if (typeof out?.lastModified === "string")
            rows.push({ label: "modified", value: out.lastModified });
    }

    // list_allowed_directories
    if (name === "list_allowed_directories") {
        const dirs = Array.isArray(out)
            ? out
            : Array.isArray(out?.directories)
              ? out.directories
              : null;
        if (Array.isArray(dirs))
            rows.push({ label: "directories", value: `${dirs.length} 条` });
    }

    return rows;
});

const titleText = computed(() => {
    const t = toolName.value || "tool";
    const map: Record<string, string> = {
        editText: "编辑文本",
        read_file: "读取文件",
        read_text_file: "读取文本文件",
        read_media_file: "读取媒体文件",
        read_multiple_files: "读取多个文件",
        write_file: "写入文件",
        edit_file: "编辑文件",
        create_directory: "创建目录",
        list_directory: "列出目录",
        list_directory_with_sizes: "列出目录（含大小）",
        directory_tree: "目录树",
        move_file: "移动文件",
        search_files: "搜索文件",
        get_file_info: "获取文件信息",
        list_allowed_directories: "列出允许的目录",
    };
    return map[t] || t;
});

function inferLanguageFromPath(path: unknown) {
    if (typeof path !== "string") return "plaintext";
    const lower = path.toLowerCase();
    if (lower.endsWith(".css")) return "css";
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
    if (lower.endsWith(".js")) return "javascript";
    if (lower.endsWith(".ts")) return "typescript";
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
    if (lower.endsWith(".vue")) return "vue";
    if (lower.endsWith(".rs")) return "rust";
    if (lower.endsWith(".py")) return "python";
    return "plaintext";
}

const writeFileContent = computed(() => {
    if (toolName.value !== "write_file") return null;
    const inp = parsedInput.value as any;
    if (inp && typeof inp === "object" && typeof inp.content === "string") {
        return inp.content as string;
    }
    return null;
});

const writeFilePath = computed(() => {
    if (toolName.value !== "write_file") return null;
    const inp = parsedInput.value as any;
    if (inp && typeof inp === "object" && typeof inp.path === "string") {
        return inp.path as string;
    }
    const out = parsedOutput.value as any;
    if (out && typeof out === "object" && typeof out.path === "string") {
        return out.path as string;
    }
    return null;
});

const writeFileLanguage = computed(() =>
    inferLanguageFromPath(writeFilePath.value)
);

type EditFileEdit = { oldText?: string; newText?: string };

const editFilePath = computed(() => {
    if (toolName.value !== "edit_file") return null;
    const inp = parsedInput.value as any;
    if (inp && typeof inp === "object" && typeof inp.path === "string") {
        return inp.path as string;
    }
    const out = parsedOutput.value as any;
    if (out && typeof out === "object" && typeof out.path === "string") {
        return out.path as string;
    }
    return null;
});

const editFileLanguage = computed(() =>
    inferLanguageFromPath(editFilePath.value)
);

const editFileEdits = computed<EditFileEdit[]>(() => {
    if (toolName.value !== "edit_file") return [];
    const inp = parsedInput.value as any;
    if (!inp || typeof inp !== "object" || !Array.isArray(inp.edits)) return [];

    return (inp.edits as any[])
        .filter((e) => e && typeof e === "object")
        .map((e) => ({
            oldText: typeof e.oldText === "string" ? e.oldText : undefined,
            newText: typeof e.newText === "string" ? e.newText : undefined,
        }));
});

function yn(value: unknown) {
    return value ? "是" : "否";
}

function dashIfEmpty(value: unknown) {
    if (value === null || value === undefined || value === "") return "-";
    return String(value);
}
</script>

<template>
    <div :class="cn('space-y-3 p-4', props.class)">
        <h4
            class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
        >
            {{ titleText }}
        </h4>

        <div
            v-if="props.errorText"
            class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
            {{ props.errorText }}
        </div>

        <template v-else>
            <div class="space-y-2">
                <h5
                    class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                >
                    输入
                </h5>

                <div
                    class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-muted/50 p-3 text-sm"
                >
                    <template v-for="row in paramsRows" :key="row.label">
                        <div class="text-muted-foreground">{{ row.label }}</div>
                        <div
                            :class="
                                row.mono
                                    ? 'break-all font-mono text-xs'
                                    : 'break-all'
                            "
                        >
                            {{ dashIfEmpty(row.value) }}
                        </div>
                    </template>
                </div>

                <Collapsible v-model:open="paramsRawOpen" class="space-y-2">
                    <div class="flex items-center justify-between gap-3">
                        <h6
                            class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                        >
                            Parameters Raw (Scrubbed)
                        </h6>
                        <CollapsibleTrigger as-child>
                            <Button variant="ghost" size="sm">
                                {{ paramsRawOpen ? "收起" : "展开" }}
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                        <CodeBlock :code="scrubbedParamsJson" language="json" />
                    </CollapsibleContent>
                </Collapsible>
            </div>

            <div
                class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-muted/50 p-3 text-sm"
            >
                <div class="text-muted-foreground">执行结果</div>
                <div>
                    <span v-if="okState === true" class="text-primary"
                        >成功</span
                    >
                    <span v-else-if="okState === false" class="text-destructive"
                        >失败</span
                    >
                    <span v-else class="text-muted-foreground">未知</span>
                </div>

                <template v-for="row in resultRows" :key="row.label">
                    <div class="text-muted-foreground">{{ row.label }}</div>
                    <div
                        :class="
                            row.mono
                                ? 'break-all font-mono text-xs'
                                : 'break-all'
                        "
                    >
                        {{ dashIfEmpty(row.value) }}
                    </div>
                </template>
            </div>

            <Collapsible
                v-if="writeFileContent"
                v-model:open="contentOpen"
                class="space-y-2"
            >
                <div class="flex items-center justify-between gap-3">
                    <h5
                        class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                    >
                        Content
                        <span
                            v-if="writeFilePath"
                            class="ml-2 normal-case text-muted-foreground"
                        >
                            ({{ writeFilePath }})
                        </span>
                    </h5>
                    <CollapsibleTrigger as-child>
                        <Button variant="ghost" size="sm">
                            {{ contentOpen ? "收起" : "展开" }}
                        </Button>
                    </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                    <CodeBlock
                        :code="writeFileContent"
                        :language="writeFileLanguage as any"
                    />
                </CollapsibleContent>
            </Collapsible>

            <Collapsible
                v-if="editFileEdits.length > 0"
                v-model:open="editsOpen"
                class="space-y-2"
            >
                <div class="flex items-center justify-between gap-3">
                    <h5
                        class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                    >
                        Edits
                        <span
                            v-if="editFilePath"
                            class="ml-2 normal-case text-muted-foreground"
                        >
                            ({{ editFilePath }})
                        </span>
                    </h5>
                    <CollapsibleTrigger as-child>
                        <Button variant="ghost" size="sm">
                            {{ editsOpen ? "收起" : "展开" }}
                        </Button>
                    </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                    <div class="space-y-3">
                        <div
                            v-for="(e, idx) in editFileEdits"
                            :key="idx"
                            class="space-y-2"
                        >
                            <div class="text-xs text-muted-foreground">
                                变更 #{{ idx + 1 }}
                            </div>
                            <div class="space-y-2">
                                <div
                                    class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                                >
                                    Old
                                </div>
                                <CodeBlock
                                    :code="e.oldText ?? ''"
                                    :language="editFileLanguage as any"
                                />
                            </div>
                            <div class="space-y-2">
                                <div
                                    class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                                >
                                    New
                                </div>
                                <CodeBlock
                                    :code="e.newText ?? ''"
                                    :language="editFileLanguage as any"
                                />
                            </div>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            <Collapsible v-model:open="rawOpen" class="space-y-2">
                <div class="flex items-center justify-between gap-3">
                    <h5
                        class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                    >
                        Raw (Scrubbed)
                    </h5>
                    <CollapsibleTrigger as-child>
                        <Button variant="ghost" size="sm">
                            {{ rawOpen ? "收起" : "展开" }}
                        </Button>
                    </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                    <CodeBlock :code="scrubbedJson" language="json" />
                </CollapsibleContent>
            </Collapsible>
        </template>
    </div>
</template>
