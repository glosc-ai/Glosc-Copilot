<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

type ToolEnvelope = {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
    structuredContent?: unknown;
};

const props = defineProps<{
    toolName?: string;
    toolType?: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
    class?: HTMLAttributes["class"];
}>();

const rawOpen = ref(false);
const paramsRawOpen = ref(false);
const collapsed = ref(true);

type ToolCategory = "list" | "action" | "dependencies" | "other";

const listTools = new Set([
    "get-supported-games-list",
    "get-manager-games-list",
    "get-current-mod-list",
    "fetch-steam-installed-games",
]);

const actionTools = new Set([
    "switch-managed-game",
    "add-game-to-manager",
    "remove-game-from-manager",
    "install-mod-by-id",
    "remove-mod-by-id",
    "add-tag-to-mod",
    "rename-mod",
    "sort-mods",
    "download-mod",
]);

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
        if (v.structuredContent !== undefined) return v.structuredContent;

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
    if (Array.isArray(value))
        return value.map((item) => scrubDeep(item, depth + 1));
    if (!value || typeof value !== "object") return value;

    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
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

const resolvedToolName = computed(() => {
    if (props.toolName && String(props.toolName).trim())
        return String(props.toolName);
    const t = String(props.toolType || "");
    if (t.startsWith("tool-")) return t.slice("tool-".length);
    return t;
});

const parsedInput = computed(() => extractEnvelopePayload(props.input));
const parsedOutput = computed(() => extractEnvelopePayload(props.output));

const inputEnv = computed(() => tryParseJson(props.input) as ToolEnvelope);
const outputEnv = computed(() => tryParseJson(props.output) as ToolEnvelope);

const okState = computed<true | false | undefined>(() => {
    if (props.errorText) return false;

    const out = parsedOutput.value as any;
    if (out && typeof out === "object" && typeof out.ok === "boolean")
        return out.ok;

    const env = outputEnv.value;
    if (env && typeof env === "object" && typeof env.isError === "boolean")
        return !env.isError;

    return undefined;
});

const category = computed<ToolCategory>(() => {
    const name = resolvedToolName.value;
    if (name === "get-mod-dependencies") return "dependencies";
    if (listTools.has(name)) return "list";
    if (actionTools.has(name)) return "action";
    return "other";
});

const isCurrentModList = computed(
    () => resolvedToolName.value === "get-current-mod-list",
);

const toolTitle = computed(() => {
    const name = resolvedToolName.value;

    if (name === "install-mod-by-id") {
        const input = parsedInput.value as any;
        const raw =
            input && typeof input === "object"
                ? (input as any).isInstall
                : undefined;
        const isInstall =
            raw === true
                ? true
                : raw === false
                  ? false
                  : typeof raw === "string"
                    ? raw.toLowerCase() === "true"
                        ? true
                        : raw.toLowerCase() === "false"
                          ? false
                          : undefined
                    : undefined;

        if (isInstall === true) return "安装 Mod";
        if (isInstall === false) return "卸载 Mod";
        return "安装/卸载 Mod";
    }

    const map: Record<string, string> = {
        "get-supported-games-list": "支持的游戏列表",
        "get-manager-games-list": "管理器已管理游戏",
        "get-current-mod-list": "当前游戏 Mod 列表",
        "fetch-steam-installed-games": "Steam 已安装游戏",
        "switch-managed-game": "切换当前管理游戏",
        "add-game-to-manager": "添加游戏到管理器",
        "remove-game-from-manager": "从管理器移除游戏",
        "remove-mod-by-id": "移除 Mod",
        "add-tag-to-mod": "添加 Mod 标签",
        "rename-mod": "重命名 Mod",
        "sort-mods": "排序 Mods",
        "download-mod": "下载 Mod",
        "get-mod-dependencies": "Mod 前置依赖",
    };
    return map[name] ?? name;
});

const statusText = computed(() => {
    if (props.errorText) return "失败";
    if (okState.value === true) return "成功";
    if (okState.value === false) return "失败";
    return "未知";
});

const statusVariant = computed<"secondary" | "destructive" | "outline">(() => {
    if (props.errorText || okState.value === false) return "destructive";
    if (okState.value === true) return "secondary";
    return "outline";
});

function getOutputMessage(value: unknown): string {
    if (typeof props.errorText === "string" && props.errorText.trim()) {
        return props.errorText;
    }
    if (typeof value === "string") return value;
    const v = value as any;
    if (!v || typeof v !== "object") return "";
    const candidates = ["message", "msg", "detail", "error", "reason"];
    for (const k of candidates) {
        if (typeof v[k] === "string" && v[k].trim()) return v[k];
    }
    return "";
}

const outputMessage = computed(() => getOutputMessage(parsedOutput.value));

function pickListPayload(value: unknown): unknown[] | null {
    const v = value as any;
    if (Array.isArray(v)) return v;
    if (!v || typeof v !== "object") return null;

    const candidates = [
        "items",
        "list",
        "data",
        "games",
        "mods",
        "dependencies",
        "results",
    ];
    for (const key of candidates) {
        if (Array.isArray(v[key])) return v[key] as unknown[];
    }

    return null;
}

function pickObjectPayload(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    return value as Record<string, unknown>;
}

function pickDependenciesPayload(value: unknown): unknown[] | null {
    const v = value as any;
    const list = pickListPayload(value);
    if (list) return list;
    if (v && typeof v === "object") {
        const candidates = ["deps", "dependencies", "requires", "required"];
        for (const k of candidates) {
            if (Array.isArray(v[k])) return v[k];
        }
    }
    return null;
}

function truncateText(value: string, max = 120) {
    if (value.length <= max) return value;
    return `${value.slice(0, max)}…`;
}

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "是" : "否";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return truncateText(value);
    if (Array.isArray(value)) {
        const parts = value
            .slice(0, 6)
            .map((it) => (typeof it === "string" ? it : JSON.stringify(it)))
            .filter(Boolean);
        const suffix = value.length > 6 ? `（+${value.length - 6}）` : "";
        return truncateText(`${parts.join(", ")}${suffix}`, 140);
    }
    try {
        return truncateText(JSON.stringify(value), 140);
    } catch {
        return "[object]";
    }
}

function normalizeBoolean(value: unknown): boolean | undefined {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === "string") {
        const v = value.trim().toLowerCase();
        if (v === "true") return true;
        if (v === "false") return false;
    }
    return undefined;
}

function getHexTextColor(hex: string): "#000" | "#fff" {
    const h = hex.trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if (!m) return "#000";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance < 0.55 ? "#fff" : "#000";
}

function getCoverUrl(row: any): string | null {
    const raw = row?.cover;
    if (typeof raw !== "string") return null;
    const url = raw.trim();
    if (!url) return null;
    if (url.includes("undefined")) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    return url;
}

function getModFiles(row: any): string[] {
    const files = row?.modFiles;
    if (!Array.isArray(files)) return [];
    return files.filter((f) => typeof f === "string") as string[];
}

function getTags(row: any): Array<{ name: string; color?: string }> {
    const tags = row?.tags;
    if (!Array.isArray(tags)) return [];
    return tags
        .map((t) => ({
            name: typeof t?.name === "string" ? t.name : "",
            color: typeof t?.color === "string" ? t.color : undefined,
        }))
        .filter((t) => t.name);
}

const currentModListColumns = [
    "cover",
    "modName",
    "modVersion",
    "modAuthor",
    "tags",
    "isInstalled",
    "modFiles",
    "webId",
    "id",
] as const;

const listTableColumns = computed(() => {
    if (isCurrentModList.value) return [...currentModListColumns];
    return tableColumns.value;
});

function getColumnLabel(col: string): string {
    if (!isCurrentModList.value) return col;
    const map: Record<string, string> = {
        cover: "封面",
        modName: "名称",
        modVersion: "版本",
        modAuthor: "作者",
        tags: "标签",
        isInstalled: "安装状态",
        modFiles: "文件",
        webId: "WebId",
        id: "Id",
    };
    return map[col] ?? col;
}

const listItems = computed(() => {
    const payload = parsedOutput.value;
    const list = pickListPayload(payload);
    return list ?? null;
});

const dependenciesItems = computed(() => {
    if (category.value !== "dependencies") return null;
    const payload = parsedOutput.value;
    return pickDependenciesPayload(payload);
});

const tableColumns = computed(() => {
    const rows = listItems.value || dependenciesItems.value;
    if (!rows || rows.length === 0) return [] as string[];

    const firstFew = rows
        .slice(0, 20)
        .filter((r) => r && typeof r === "object") as Array<
        Record<string, unknown>
    >;
    if (firstFew.length === 0) return [] as string[];

    const keySet = new Set<string>();
    for (const row of firstFew) {
        for (const k of Object.keys(row)) keySet.add(k);
    }

    if (isCurrentModList.value) {
        keySet.delete("advanced");
        keySet.delete("other");
        keySet.delete("modFiles");
        keySet.delete("tags");
        keySet.delete("cover");
    }

    const preferred = [
        "GlossGameId",
        "GlassGameId",
        "id",
        "gameId",
        "modId",
        "name",
        "title",
        "version",
        "from",
        "webId",
        "installed",
        "managed",
        "enabled",
        "gamePath",
        "path",
        "tags",
    ];

    const keys = Array.from(keySet);
    const ordered = [
        ...preferred.filter((k) => keySet.has(k)),
        ...keys
            .filter((k) => !preferred.includes(k))
            .sort((a, b) => a.localeCompare(b)),
    ];

    return ordered.slice(0, 10);
});

const actionInputKv = computed(() => {
    if (category.value !== "action")
        return [] as Array<{ label: string; value: string }>;

    const name = resolvedToolName.value;
    const input = parsedInput.value as any;
    const rows: Array<{ label: string; value: string }> = [];

    const pushIf = (label: string, value: unknown) => {
        const text = formatCell(value);
        if (text) rows.push({ label, value: text });
    };

    if (name === "switch-managed-game") {
        pushIf("GlossGameId", input?.GlossGameId);
    } else if (name === "add-game-to-manager") {
        pushIf("GlossGameId", input?.GlossGameId);
        pushIf("gamePath", input?.gamePath);
    } else if (name === "remove-game-from-manager") {
        pushIf("GlossGameId", input?.GlossGameId);
    } else if (name === "install-mod-by-id") {
        pushIf("modId", input?.modId);
        pushIf("isInstall", input?.isInstall);
    } else if (name === "remove-mod-by-id") {
        pushIf("modId", input?.modId);
    } else if (name === "add-tag-to-mod") {
        pushIf("modId", input?.modId);
        pushIf("tag.name", input?.tag?.name);
        pushIf("tag.color", input?.tag?.color);
    } else if (name === "rename-mod") {
        pushIf("modId", input?.modId);
        pushIf("newName", input?.newName);
    } else if (name === "sort-mods") {
        pushIf(
            "list",
            Array.isArray(input?.list)
                ? `共 ${input.list.length} 条`
                : input?.list,
        );
    } else if (name === "download-mod") {
        pushIf("webId", input?.webId);
        pushIf("from", input?.from);
        pushIf("name", input?.name);
        pushIf("other.namespace", input?.other?.namespace);
        pushIf("other.name", input?.other?.name);
        pushIf("modWebsite", input?.modWebsite);
    }

    return rows;
});

const actionOutputKv = computed(() => {
    if (category.value !== "action") return null;
    const payload = parsedOutput.value;
    const obj = pickObjectPayload(payload);
    if (!obj) return null;

    const allowKeys = [
        "ok",
        "success",
        "message",
        "msg",
        "detail",
        "error",
        "data",
        "result",
    ];

    const rows: Array<{ label: string; value: string }> = [];
    for (const k of allowKeys) {
        if (k in obj)
            rows.push({ label: k, value: formatCell((obj as any)[k]) });
    }

    return rows.filter((r) => r.value);
});

const scrubbedRawOutput = computed(() => {
    const v = scrubDeep(outputEnv.value);
    if (typeof v === "string") return v;
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
});

const scrubbedRawInput = computed(() => {
    const v = scrubDeep(inputEnv.value);
    if (typeof v === "string") return v;
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
});

const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    ElMessage.success("已复制到剪贴板");
};

const getStatusTextColor = (text: string) => {
    if (text === "成功") {
        return "text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/15";
    } else if (text === "失败") {
        return "text-destructive border-destructive/40 bg-destructive/15";
    } else {
        return "text-muted-foreground";
    }
};
</script>

<template>
    <Collapsible :open="!collapsed" @update:open="(v) => (collapsed = !v)">
        <CollapsibleTrigger as-child>
            <Card
                :class="cn('overflow-hidden cursor-pointer', props.class)"
                v-bind="$attrs"
                variant="outline"
            >
                <CardHeader class="p-4">
                    <div class="flex items-start justify-between gap-3">
                        <div class="space-y-1">
                            <CardTitle class="text-[14px]">{{
                                toolTitle
                            }}</CardTitle>
                            <CardDescription class="text-xs">
                                <span class="font-mono">{{
                                    resolvedToolName
                                }}</span>
                            </CardDescription>
                        </div>

                        <!-- <Badge :variant="statusVariant"> -->
                        <Badge
                            variant="outline"
                            :class="getStatusTextColor(statusText)"
                        >
                            {{ statusText }}
                        </Badge>
                    </div>
                </CardHeader>
            </Card>
        </CollapsibleTrigger>

        <CollapsibleContent>
            <Card
                :class="
                    cn('overflow-hidden border-t-0 rounded-t-none', props.class)
                "
                v-bind="$attrs"
                variant="outline"
            >
                <CardHeader class="pb-4">
                    <Alert
                        v-if="outputMessage"
                        :variant="
                            statusVariant === 'destructive'
                                ? 'destructive'
                                : 'default'
                        "
                        class="mt-3"
                    >
                        <AlertTitle>
                            {{
                                category === "action" ? "执行信息" : "获取状态"
                            }}
                        </AlertTitle>
                        <AlertDescription>
                            {{ outputMessage }}
                        </AlertDescription>
                    </Alert>
                </CardHeader>
                <CardContent class="space-y-4">
                    <!-- 1) 列表类：状态 + 表格 -->
                    <template v-if="category === 'list'">
                        <div class="text-xs text-muted-foreground">
                            共 {{ (listItems || []).length }} 条
                            <template
                                v-if="
                                    isCurrentModList &&
                                    (parsedOutput as any)?.count !== undefined
                                "
                            >
                                （接口 count:
                                {{ (parsedOutput as any)?.count }}）
                            </template>
                        </div>

                        <div
                            v-if="listItems && listTableColumns.length"
                            class="overflow-x-auto rounded-md border"
                        >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead
                                            v-for="col in listTableColumns"
                                            :key="col"
                                            class="whitespace-nowrap"
                                        >
                                            {{ getColumnLabel(col) }}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow
                                        v-for="(row, rowIndex) in listItems"
                                        :key="rowIndex"
                                    >
                                        <TableCell
                                            v-for="col in listTableColumns"
                                            :key="col"
                                            class="whitespace-nowrap align-top"
                                        >
                                            <template v-if="isCurrentModList">
                                                <template
                                                    v-if="col === 'cover'"
                                                >
                                                    <div class="h-10 w-10">
                                                        <img
                                                            v-if="
                                                                getCoverUrl(row)
                                                            "
                                                            :src="
                                                                getCoverUrl(
                                                                    row,
                                                                ) as string
                                                            "
                                                            class="h-10 w-10 rounded border object-cover"
                                                            loading="lazy"
                                                            referrerpolicy="no-referrer"
                                                        />
                                                        <div
                                                            v-else
                                                            class="h-10 w-10 rounded border bg-muted/50"
                                                        />
                                                    </div>
                                                </template>

                                                <template
                                                    v-else-if="col === 'tags'"
                                                >
                                                    <div
                                                        class="flex flex-wrap gap-1"
                                                    >
                                                        <Badge
                                                            v-for="(
                                                                tag, tagIdx
                                                            ) in getTags(
                                                                row,
                                                            ).slice(0, 8)"
                                                            :key="tagIdx"
                                                            variant="outline"
                                                            :style="
                                                                tag.color
                                                                    ? {
                                                                          background:
                                                                              tag.color,
                                                                          borderColor:
                                                                              tag.color,
                                                                          color: getHexTextColor(
                                                                              tag.color,
                                                                          ),
                                                                      }
                                                                    : undefined
                                                            "
                                                        >
                                                            {{ tag.name }}
                                                        </Badge>
                                                        <Badge
                                                            v-if="
                                                                getTags(row)
                                                                    .length > 8
                                                            "
                                                            variant="outline"
                                                        >
                                                            +{{
                                                                getTags(row)
                                                                    .length - 8
                                                            }}
                                                        </Badge>
                                                    </div>
                                                </template>

                                                <template
                                                    v-else-if="
                                                        col === 'modFiles'
                                                    "
                                                >
                                                    <HoverCard
                                                        :open-delay="150"
                                                        :close-delay="80"
                                                    >
                                                        <HoverCardTrigger
                                                            as-child
                                                        >
                                                            <Badge
                                                                variant="outline"
                                                                class="font-mono"
                                                            >
                                                                {{
                                                                    getModFiles(
                                                                        row,
                                                                    ).length
                                                                }}
                                                            </Badge>
                                                        </HoverCardTrigger>
                                                        <HoverCardContent
                                                            class="w-130"
                                                        >
                                                            <div
                                                                class="text-xs font-medium mb-2"
                                                            >
                                                                文件列表（{{
                                                                    getModFiles(
                                                                        row,
                                                                    ).length
                                                                }}）
                                                            </div>
                                                            <div
                                                                class="max-h-65 overflow-auto pr-1 space-y-1 font-mono text-[11px]"
                                                            >
                                                                <div
                                                                    v-for="(
                                                                        f, fi
                                                                    ) in getModFiles(
                                                                        row,
                                                                    ).slice(
                                                                        0,
                                                                        200,
                                                                    )"
                                                                    :key="fi"
                                                                    class="break-all"
                                                                >
                                                                    {{ f }}
                                                                </div>
                                                                <div
                                                                    v-if="
                                                                        getModFiles(
                                                                            row,
                                                                        )
                                                                            .length >
                                                                        200
                                                                    "
                                                                    class="text-muted-foreground"
                                                                >
                                                                    仅展示前 200
                                                                    条
                                                                </div>
                                                            </div>
                                                        </HoverCardContent>
                                                    </HoverCard>
                                                </template>

                                                <template
                                                    v-else-if="
                                                        col === 'isInstalled'
                                                    "
                                                >
                                                    <Badge
                                                        v-if="
                                                            normalizeBoolean(
                                                                (row as any)
                                                                    ?.isInstalled,
                                                            ) === true
                                                        "
                                                        variant="outline"
                                                        class="border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                                    >
                                                        已安装
                                                    </Badge>
                                                    <Badge
                                                        v-else
                                                        variant="outline"
                                                        class="border-muted-foreground/25 bg-muted/30 text-muted-foreground"
                                                    >
                                                        未安装
                                                    </Badge>
                                                </template>

                                                <template v-else>
                                                    {{
                                                        formatCell(
                                                            (row as any)?.[col],
                                                        )
                                                    }}
                                                </template>
                                            </template>

                                            <template v-else>
                                                {{
                                                    formatCell(
                                                        (row as any)?.[col],
                                                    )
                                                }}
                                            </template>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>

                        <div v-else class="rounded-md bg-muted/50">
                            <CodeBlock
                                :code="
                                    typeof parsedOutput === 'string'
                                        ? parsedOutput
                                        : JSON.stringify(
                                              parsedOutput ?? null,
                                              null,
                                              2,
                                          )
                                "
                                language="json"
                            />
                        </div>

                        <div
                            v-if="listItems && listItems.length > 200"
                            class="text-xs text-muted-foreground"
                        >
                            仅展示前 200 条
                        </div>
                    </template>

                    <!-- 2) 操作类：显示操作 + 结果 -->
                    <template v-else-if="category === 'action'">
                        <div class="space-y-2">
                            <div
                                class="text-xs font-medium text-muted-foreground"
                            >
                                操作
                            </div>
                            <div
                                v-if="actionInputKv.length"
                                class="grid grid-cols-1 sm:grid-cols-2 gap-2"
                            >
                                <div
                                    v-for="row in actionInputKv"
                                    :key="row.label"
                                    class="rounded-md border bg-muted/20 px-3 py-2"
                                >
                                    <div
                                        class="text-[11px] text-muted-foreground"
                                    >
                                        {{ row.label }}
                                    </div>
                                    <div class="text-xs font-mono break-all">
                                        {{ row.value }}
                                    </div>
                                </div>
                            </div>
                            <div v-else class="text-xs text-muted-foreground">
                                （无参数）
                            </div>
                        </div>

                        <Separator />

                        <div class="space-y-2">
                            <div
                                class="text-xs font-medium text-muted-foreground"
                            >
                                执行结果
                            </div>

                            <div
                                v-if="props.errorText"
                                class="rounded-md bg-destructive/10 p-3 text-xs text-destructive"
                            >
                                {{ props.errorText }}
                            </div>

                            <div
                                v-else-if="
                                    actionOutputKv && actionOutputKv.length
                                "
                                class="grid grid-cols-1"
                            >
                                <div
                                    v-for="row in actionOutputKv"
                                    :key="row.label"
                                    class="rounded-md border bg-muted/20 px-3 py-2"
                                >
                                    <div
                                        class="text-[11px] text-muted-foreground"
                                    >
                                        {{ row.label }}
                                    </div>
                                    <div class="text-xs font-mono break-all">
                                        {{ row.value }}
                                    </div>
                                </div>
                            </div>

                            <div v-else class="rounded-md bg-muted/50">
                                <CodeBlock
                                    :code="
                                        typeof parsedOutput === 'string'
                                            ? parsedOutput
                                            : JSON.stringify(
                                                  parsedOutput ?? null,
                                                  null,
                                                  2,
                                              )
                                    "
                                    language="json"
                                />
                            </div>
                        </div>
                    </template>

                    <!-- 3) 依赖：显示内容 -->
                    <template v-else-if="category === 'dependencies'">
                        <div class="text-xs text-muted-foreground">
                            依赖列表
                        </div>

                        <div
                            v-if="dependenciesItems && dependenciesItems.length"
                            class="flex flex-wrap gap-2"
                        >
                            <Badge
                                v-for="(dep, idx) in dependenciesItems.slice(
                                    0,
                                    50,
                                )"
                                :key="idx"
                                variant="outline"
                                class="font-mono"
                            >
                                {{ formatCell(dep) }}
                            </Badge>
                        </div>

                        <div v-else class="rounded-md bg-muted/50">
                            <CodeBlock
                                :code="
                                    typeof parsedOutput === 'string'
                                        ? parsedOutput
                                        : JSON.stringify(
                                              parsedOutput ?? null,
                                              null,
                                              2,
                                          )
                                "
                                language="json"
                            />
                        </div>
                    </template>

                    <!-- 兜底 -->
                    <template v-else>
                        <div class="rounded-md bg-muted/50">
                            <CodeBlock
                                :code="
                                    typeof parsedOutput === 'string'
                                        ? parsedOutput
                                        : JSON.stringify(
                                              parsedOutput ?? null,
                                              null,
                                              2,
                                          )
                                "
                                language="json"
                            />
                        </div>
                    </template>

                    <Separator />

                    <div class="flex items-center justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            @click="paramsRawOpen = true"
                        >
                            参数（原始）
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            @click="rawOpen = true"
                        >
                            输出（原始）
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </CollapsibleContent>
    </Collapsible>
    <Dialog v-model:open="paramsRawOpen">
        <DialogScrollContent
            class="w-[92vw] max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
        >
            <DialogHeader>
                <DialogTitle>参数（原始） - {{ resolvedToolName }}</DialogTitle>
            </DialogHeader>
            <div class="flex-1 overflow-y-auto pr-1">
                <div class="rounded-md bg-muted/50">
                    <CodeBlock :code="scrubbedRawInput" language="json" />
                </div>
            </div>
        </DialogScrollContent>
    </Dialog>

    <Dialog v-model:open="rawOpen">
        <DialogScrollContent
            class="w-[92vw] max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
        >
            <DialogHeader>
                <DialogTitle>输出（原始） - {{ resolvedToolName }}</DialogTitle>
            </DialogHeader>
            <div class="flex-1 overflow-y-auto pr-1">
                <div class="rounded-md bg-muted/50">
                    <CodeBlock :code="scrubbedRawOutput" language="json">
                        <CodeBlockCopyButton
                            @copy="handleCopy(scrubbedRawOutput)"
                        />
                    </CodeBlock>
                </div>
            </div>
        </DialogScrollContent>
    </Dialog>
</template>
