<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

type ToolEnvelope = {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
    structuredContent?: unknown;
};

type CommitFileStatusType = "added" | "modified" | "deleted" | "renamed";

type CommitFileItem = {
    path: string;
    status: CommitFileStatusType;
    additions: number;
    deletions: number;
};

type DiffOp = { type: "equal" | "insert" | "delete"; line: string };

const props = withDefaults(
    defineProps<{
        toolName?: string;
        toolType?: string;
        input?: unknown;
        output?: unknown;
        errorText?: string;
        class?: HTMLAttributes["class"];
    }>(),
    {
        toolName: undefined,
        toolType: undefined,
        input: undefined,
        output: undefined,
        errorText: undefined,
        class: undefined,
    },
);

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
    if (Array.isArray(value)) return value.map((x) => scrubDeep(x, depth + 1));
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

function normalizeNewlines(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitLines(text: string): string[] {
    // 保留空行语义；末尾换行不强行补行
    return normalizeNewlines(text).split("\n");
}

function commonPrefixLength<T>(a: T[], b: T[]): number {
    const n = Math.min(a.length, b.length);
    let i = 0;
    for (; i < n; i += 1) if (a[i] !== b[i]) break;
    return i;
}

function commonSuffixLength<T>(a: T[], b: T[], prefixLen = 0): number {
    const max = Math.min(a.length, b.length);
    let i = 0;
    while (i < max - prefixLen && a[a.length - 1 - i] === b[b.length - 1 - i]) {
        i += 1;
    }
    return i;
}

function diffFallbackByPrefixSuffix(
    oldLines: string[],
    newLines: string[],
): {
    ops: DiffOp[];
    additions: number;
    deletions: number;
} {
    const prefix = commonPrefixLength(oldLines, newLines);
    const suffix = commonSuffixLength(oldLines, newLines, prefix);

    const oldMid = oldLines.slice(prefix, oldLines.length - suffix);
    const newMid = newLines.slice(prefix, newLines.length - suffix);

    const ops: DiffOp[] = [];
    for (const l of oldLines.slice(0, prefix))
        ops.push({ type: "equal", line: l });
    for (const l of oldMid) ops.push({ type: "delete", line: l });
    for (const l of newMid) ops.push({ type: "insert", line: l });
    for (const l of oldLines.slice(oldLines.length - suffix))
        ops.push({ type: "equal", line: l });

    return {
        ops,
        additions: newMid.length,
        deletions: oldMid.length,
    };
}

// Myers diff（行级）— 仅用于中等规模；过大时降级到 prefix/suffix
function myersDiff(oldLines: string[], newLines: string[]): DiffOp[] {
    const N = oldLines.length;
    const M = newLines.length;
    const max = N + M;

    // v[k] = x
    let v = new Map<number, number>();
    v.set(1, 0);

    const trace: Array<Map<number, number>> = [];

    for (let d = 0; d <= max; d += 1) {
        const vNext = new Map<number, number>();
        for (let k = -d; k <= d; k += 2) {
            let x: number;
            const vKMinus = v.get(k - 1);
            const vKPlus = v.get(k + 1);

            if (k === -d || (k !== d && (vKMinus ?? -1) < (vKPlus ?? -1))) {
                x = vKPlus ?? 0;
            } else {
                x = (vKMinus ?? 0) + 1;
            }

            let y = x - k;
            while (x < N && y < M && oldLines[x] === newLines[y]) {
                x += 1;
                y += 1;
            }

            vNext.set(k, x);

            if (x >= N && y >= M) {
                trace.push(vNext);
                return backtrackMyers(trace, oldLines, newLines);
            }
        }

        trace.push(vNext);
        v = vNext;
    }

    return diffFallbackByPrefixSuffix(oldLines, newLines).ops;
}

function backtrackMyers(
    trace: Array<Map<number, number>>,
    oldLines: string[],
    newLines: string[],
): DiffOp[] {
    let x = oldLines.length;
    let y = newLines.length;

    const ops: DiffOp[] = [];

    for (let d = trace.length - 1; d > 0; d -= 1) {
        const v = trace[d];
        const k = x - y;

        let prevK: number;
        const vKMinus = v.get(k - 1);
        const vKPlus = v.get(k + 1);
        if (k === -d || (k !== d && (vKMinus ?? -1) < (vKPlus ?? -1))) {
            prevK = k + 1;
        } else {
            prevK = k - 1;
        }

        const prevV = trace[d - 1];
        const prevX = prevV.get(prevK) ?? 0;
        const prevY = prevX - prevK;

        while (x > prevX && y > prevY) {
            ops.push({ type: "equal", line: oldLines[x - 1] });
            x -= 1;
            y -= 1;
        }

        if (x === prevX) {
            // insertion
            ops.push({ type: "insert", line: newLines[prevY] ?? "" });
        } else {
            // deletion
            ops.push({ type: "delete", line: oldLines[prevX] ?? "" });
        }

        x = prevX;
        y = prevY;
    }

    while (x > 0 && y > 0) {
        ops.push({ type: "equal", line: oldLines[x - 1] });
        x -= 1;
        y -= 1;
    }
    while (x > 0) {
        ops.push({ type: "delete", line: oldLines[x - 1] });
        x -= 1;
    }
    while (y > 0) {
        ops.push({ type: "insert", line: newLines[y - 1] });
        y -= 1;
    }

    ops.reverse();
    return ops;
}

function buildUnifiedDiff(ops: DiffOp[], options?: { maxLines?: number }) {
    const maxLines = options?.maxLines ?? 500;
    let additions = 0;
    let deletions = 0;

    const bodyLines = ops.map((op) => {
        if (op.type === "insert") additions += 1;
        if (op.type === "delete") deletions += 1;

        const prefix =
            op.type === "insert" ? "+" : op.type === "delete" ? "-" : " ";
        return `${prefix}${op.line}`;
    });

    const clipped = bodyLines.length > maxLines;
    const headCount = clipped ? Math.floor(maxLines / 2) : bodyLines.length;
    const tailCount = clipped ? maxLines - headCount : 0;

    const finalBody = clipped
        ? [
              ...bodyLines.slice(0, headCount),
              `...（已省略 ${bodyLines.length - maxLines} 行）...`,
              ...bodyLines.slice(bodyLines.length - tailCount),
          ]
        : bodyLines;

    return {
        diffText: [
            "--- old_string",
            "+++ new_string",
            `@@ -1,${Math.max(1, ops.filter((o) => o.type !== "insert").length)} +1,${Math.max(1, ops.filter((o) => o.type !== "delete").length)} @@`,
            ...finalBody,
        ].join("\n"),
        additions,
        deletions,
        clipped,
    };
}

function stableHash(input: string): string {
    // FNV-1a 32bit（足够做 UI hash）
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

const commitHashFull = computed(() => {
    const seed = JSON.stringify(
        {
            name: resolvedToolName.value,
            input: scrubDeep(parsedInput.value),
        },
        null,
        0,
    );
    return stableHash(seed) + stableHash(seed + "#2") + stableHash(seed + "#3");
});

const commitHashShort = computed(() => commitHashFull.value.slice(0, 7));

const commitTitle = computed(() => {
    const name = resolvedToolName.value;
    const input = parsedInput.value as any;

    if (name === "readFile") return "读取文件";
    if (name === "writeFile") {
        const mode = typeof input?.mode === "string" ? input.mode : "";
        const map: Record<string, string> = {
            overwrite: "写入文件（覆盖）",
            insert_line: "写入文件（插入单行）",
            insert_lines: "写入文件（插入多行）",
            replace: "写入文件（替换）",
            create: "写入文件（新建）",
        };
        return map[mode] ?? "写入文件";
    }
    if (name === "renameFile") return "重命名文件";
    if (name === "moveFile") return "移动文件";
    if (name === "listFilesRecursive") return "递归列出文件";
    return name || "工具执行";
});

function toCommitFiles(): CommitFileItem[] {
    const name = resolvedToolName.value;
    const input = parsedInput.value as any;

    if (name === "readFile") {
        const p = typeof input?.path === "string" ? input.path : "";
        return p
            ? [{ path: p, status: "modified", additions: 0, deletions: 0 }]
            : [];
    }

    if (name === "writeFile") {
        const p = typeof input?.path === "string" ? input.path : "";
        const mode = typeof input?.mode === "string" ? input.mode : "";
        const status: CommitFileStatusType =
            mode === "create" ? "added" : "modified";

        let additions = 0;
        let deletions = 0;

        if (mode === "replace") {
            const oldStr =
                typeof input?.old_string === "string" ? input.old_string : "";
            const newStr =
                typeof input?.new_string === "string" ? input.new_string : "";
            if (oldStr || newStr) {
                const oldLines = splitLines(oldStr);
                const newLines = splitLines(newStr);

                const tooLarge = oldLines.length * newLines.length > 2_000_000;
                const ops = tooLarge
                    ? diffFallbackByPrefixSuffix(oldLines, newLines).ops
                    : myersDiff(oldLines, newLines);
                const stats = buildUnifiedDiff(ops, { maxLines: 600 });
                additions = stats.additions;
                deletions = stats.deletions;
            }
        } else {
            // additions/deletions 无法精确；尽量给个可读的“规模感”
            const content =
                typeof input?.content === "string" ? input.content : "";
            additions = content
                ? Math.max(1, content.split(/\r?\n/).length)
                : 0;
            deletions = 0;
        }

        return p ? [{ path: p, status, additions, deletions }] : [];
    }

    if (name === "renameFile") {
        const p = typeof input?.path === "string" ? input.path : "";
        const newName = typeof input?.newName === "string" ? input.newName : "";
        if (!p || !newName) return [];

        const sep = p.includes("/") ? "/" : p.includes("\\") ? "\\" : "/";
        const last = p.lastIndexOf(sep);
        const dir = last >= 0 ? p.slice(0, last + 1) : "";
        const nextPath = `${dir}${newName}`;
        return [
            {
                path: `${p} → ${nextPath}`,
                status: "renamed",
                additions: 0,
                deletions: 0,
            },
        ];
    }

    if (name === "moveFile") {
        const from = typeof input?.from === "string" ? input.from : "";
        const to = typeof input?.to === "string" ? input.to : "";
        return from && to
            ? [
                  {
                      path: `${from} → ${to}`,
                      status: "renamed",
                      additions: 0,
                      deletions: 0,
                  },
              ]
            : [];
    }

    if (name === "listFilesRecursive") {
        const dir = typeof input?.dir === "string" ? input.dir : "";
        return dir
            ? [{ path: dir, status: "modified", additions: 0, deletions: 0 }]
            : [];
    }

    return [];
}

const files = computed(() => toCommitFiles());

const replaceDiff = computed(() => {
    const name = resolvedToolName.value;
    if (name !== "writeFile") return null;

    const input = parsedInput.value as any;
    const mode = typeof input?.mode === "string" ? input.mode : "";
    if (mode !== "replace") return null;

    const oldStr =
        typeof input?.old_string === "string" ? input.old_string : "";
    const newStr =
        typeof input?.new_string === "string" ? input.new_string : "";
    if (!oldStr && !newStr) return null;

    const oldLines = splitLines(oldStr);
    const newLines = splitLines(newStr);
    const tooLarge = oldLines.length * newLines.length > 2_000_000;

    const ops = tooLarge
        ? diffFallbackByPrefixSuffix(oldLines, newLines).ops
        : myersDiff(oldLines, newLines);

    return buildUnifiedDiff(ops, { maxLines: 600 });
});

const summaryLine = computed(() => {
    const name = resolvedToolName.value;
    const input = parsedInput.value as any;

    if (name === "readFile")
        return typeof input?.path === "string" ? input.path : "";
    if (name === "writeFile") {
        const p = typeof input?.path === "string" ? input.path : "";
        const mode = typeof input?.mode === "string" ? input.mode : "";
        const suffix = mode ? `（${mode}）` : "";
        return p ? `${p}${suffix}` : suffix;
    }
    if (name === "renameFile") {
        const p = typeof input?.path === "string" ? input.path : "";
        const n = typeof input?.newName === "string" ? input.newName : "";
        return p && n ? `${p} → ${n}` : "";
    }
    if (name === "moveFile") {
        const from = typeof input?.from === "string" ? input.from : "";
        const to = typeof input?.to === "string" ? input.to : "";
        return from && to ? `${from} → ${to}` : "";
    }
    if (name === "listFilesRecursive") {
        const dir = typeof input?.dir === "string" ? input.dir : "";
        const limit =
            typeof input?.limit === "number" ? input.limit : undefined;
        return dir
            ? `${dir}${typeof limit === "number" ? `（limit=${limit}）` : ""}`
            : "";
    }

    return "";
});

function pickTextLikeOutput(value: unknown): string | null {
    if (typeof props.errorText === "string" && props.errorText.trim()) {
        return props.errorText;
    }

    if (typeof value === "string") return value;

    const v = value as any;
    if (!v || typeof v !== "object") return null;

    const candidates = [
        "text",
        "content",
        "data",
        "message",
        "result",
        "output",
    ];
    for (const key of candidates) {
        if (typeof v[key] === "string" && v[key].trim()) return v[key];
    }

    return null;
}

const outputText = computed(() => pickTextLikeOutput(parsedOutput.value));

function pickImageSrc(value: unknown): string | null {
    const v = value as any;
    if (typeof v === "string") {
        return v.startsWith("data:image/") ? v : null;
    }
    if (!v || typeof v !== "object") return null;

    const candidates = ["url", "dataUrl", "data_url", "image", "src"];
    for (const k of candidates) {
        if (typeof v[k] === "string" && v[k].startsWith("data:image/")) {
            return v[k];
        }
    }
    return null;
}

const previewImageSrc = computed(() => {
    const name = resolvedToolName.value;
    if (name !== "readFile") return null;
    return pickImageSrc(parsedOutput.value);
});

const outputJson = computed(() => {
    const v = scrubDeep(parsedOutput.value);
    if (typeof v === "string") return null;
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
});

const showJson = computed(() => {
    // readFile / listFilesRecursive 往往输出较大，优先 JSON
    if (props.errorText) return true;
    if (outputJson.value) return true;
    return false;
});

const statusBadgeText = computed(() => {
    if (props.errorText || okState.value === false) return "失败";
    if (okState.value === true) return "成功";
    return "执行完成";
});

const statusBadgeClass = computed(() => {
    if (props.errorText || okState.value === false)
        return "bg-destructive/10 text-destructive";
    if (okState.value === true)
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    return "bg-muted/40 text-muted-foreground";
});

const hasOutputContent = computed(() => {
    return !!(
        previewImageSrc.value ||
        replaceDiff.value ||
        (showJson.value && outputJson.value) ||
        outputText.value
    );
});

const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    ElMessage.success("已复制到剪贴板");
};
</script>

<template>
    <div :class="cn('w-full', props.class)" v-bind="$attrs">
        <Commit>
            <CommitHeader>
                <CommitAuthor>
                    <CommitAuthorAvatar initials="AI" />
                </CommitAuthor>

                <CommitInfo>
                    <CommitMessage>
                        {{ commitTitle }}
                        <span
                            v-if="summaryLine"
                            class="ml-2 text-xs font-normal text-muted-foreground"
                        >
                            {{ summaryLine }}
                        </span>
                    </CommitMessage>

                    <CommitMetadata>
                        <span
                            class="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium"
                            :class="statusBadgeClass"
                        >
                            {{ statusBadgeText }}
                        </span>
                        <CommitHash>{{ commitHashShort }}</CommitHash>
                        <CommitSeparator />
                        <CommitTimestamp :date="Date.now()" />
                    </CommitMetadata>
                </CommitInfo>

                <CommitActions>
                    <CommitCopyButton
                        :hash="commitHashFull"
                        :onError="
                            (e) => console.error('copy commit hash failed', e)
                        "
                    />
                </CommitActions>
            </CommitHeader>

            <CommitContent>
                <CommitFiles
                    v-if="files.length"
                    :defaultOpen="true"
                    title="变更项"
                >
                    <CommitFile v-for="f in files" :key="f.path">
                        <CommitFileInfo :title="f.path">
                            <CommitFileStatus :status="f.status" />
                            <CommitFileIcon />
                            <CommitFilePath>{{ f.path }}</CommitFilePath>
                        </CommitFileInfo>

                        <CommitFileChanges>
                            <CommitFileAdditions :count="f.additions" />
                            <CommitFileDeletions :count="f.deletions" />
                        </CommitFileChanges>
                    </CommitFile>
                </CommitFiles>

                <div class="mt-3">
                    <Dialog v-if="hasOutputContent">
                        <DialogTrigger as-child>
                            <Button variant="outline" size="sm">
                                查看详细输出
                            </Button>
                        </DialogTrigger>
                        <DialogContent class="max-h-[80vh]">
                            <DialogHeader>
                                <DialogTitle>工具输出详情</DialogTitle>
                            </DialogHeader>
                            <div class="space-y-4">
                                <img
                                    v-if="previewImageSrc"
                                    :src="previewImageSrc"
                                    class="max-w-full rounded-md border"
                                    alt="readFile preview"
                                />

                                <div v-if="replaceDiff" class="space-y-2">
                                    <div class="text-xs text-muted-foreground">
                                        差分：+{{ replaceDiff.additions }} -{{
                                            replaceDiff.deletions
                                        }}
                                        <span v-if="replaceDiff.clipped"
                                            >（已截断）</span
                                        >
                                    </div>
                                    <CodeBlock
                                        :code="replaceDiff.diffText"
                                        language="diff"
                                        class="rounded-md overflow-auto max-w-115"
                                    >
                                        <CodeBlockCopyButton
                                            @copy="
                                                handleCopy(replaceDiff.diffText)
                                            "
                                        />
                                    </CodeBlock>
                                </div>
                                <CodeBlock
                                    v-if="showJson && outputJson"
                                    :code="outputJson"
                                    language="json"
                                    class="rounded-md overflow-auto max-w-115"
                                >
                                    <CodeBlockCopyButton
                                        @copy="handleCopy(outputJson)"
                                    />
                                </CodeBlock>
                                <pre
                                    v-else-if="outputText"
                                    class="w-full overflow-x-auto rounded-md border bg-background p-3 text-xs text-foreground whitespace-pre-wrap"
                                ><code>{{ outputText }}</code></pre>
                            </div>
                        </DialogContent>
                    </Dialog>
                    <div v-else class="text-xs text-muted-foreground">
                        （无输出）
                    </div>
                </div>
            </CommitContent>
        </Commit>
    </div>
</template>
