<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";

import { CodeBlock } from "@/components/ai-elements/code-block";
import MemoizedMarkdown from "@/components/ai-elements/message/MemoizedMarkdown.vue";
import {
    Queue,
    QueueItem,
    QueueItemContent,
    QueueItemDescription,
    QueueItemIndicator,
    QueueList,
    QueueSection,
    QueueSectionContent,
    QueueSectionLabel,
    QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import { cn } from "@/lib/utils";

type SequentialThinkingStructured = {
    thoughtNumber: number;
    totalThoughts: number;
    nextThoughtNeeded: boolean;
    branches?: unknown[];
    thoughtHistoryLength?: number;

    // 兼容其它实现/旧字段
    thought?: string;
    isRevision?: boolean;
    revisesThought?: number;
    branchFromThought?: number;
    branchId?: string;
    needsMoreThoughts?: boolean;
};

const props = defineProps<{
    input?: unknown;
    output?: unknown;
    errorText?: string;
    class?: HTMLAttributes["class"];
}>();

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

function isSequentialThinkingStructured(
    value: unknown,
): value is SequentialThinkingStructured {
    if (!value || typeof value !== "object") return false;
    const v = value as any;
    return (
        typeof v.nextThoughtNeeded === "boolean" &&
        typeof v.thoughtNumber === "number" &&
        typeof v.totalThoughts === "number"
    );
}

function extractStructured(
    value: unknown,
): SequentialThinkingStructured | null {
    const v = value as any;

    // 1) 直接就是结构
    if (isSequentialThinkingStructured(value)) return value;

    // 2) envelope.structuredContent
    if (
        v &&
        typeof v === "object" &&
        isSequentialThinkingStructured(v.structuredContent)
    ) {
        return v.structuredContent;
    }

    // 3) envelope.content[0].text 里包了一段 JSON
    const firstText =
        v &&
        typeof v === "object" &&
        Array.isArray(v.content) &&
        v.content.length > 0 &&
        typeof v.content[0]?.text === "string"
            ? (v.content[0].text as string)
            : null;
    if (firstText) {
        const parsed = tryParseJson(firstText);
        if (isSequentialThinkingStructured(parsed)) return parsed;
        const parsedAny = parsed as any;
        if (
            parsedAny &&
            typeof parsedAny === "object" &&
            isSequentialThinkingStructured(parsedAny.structuredContent)
        ) {
            return parsedAny.structuredContent;
        }
    }

    return null;
}

function scrubThoughtDeep(value: unknown, depth = 0): unknown {
    if (depth > 6) return value;
    if (Array.isArray(value)) {
        return value.map((item) => scrubThoughtDeep(item, depth + 1));
    }
    if (!value || typeof value !== "object") return value;
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
        if (key === "thought") {
            next[key] = "（已脱敏：请查看上方 Thought 区域）";
            continue;
        }
        next[key] = scrubThoughtDeep(val, depth + 1);
    }
    return next;
}

const parsedOutput = computed(() => tryParseJson(props.output));
const parsedInput = computed(() => tryParseJson(props.input));

const seq = computed<SequentialThinkingStructured | null>(() =>
    extractStructured(parsedOutput.value),
);
const params = computed<SequentialThinkingStructured | null>(() =>
    extractStructured(parsedInput.value),
);

const thoughtText = computed<string | null>(() => {
    const s = seq.value;
    if (s && typeof s.thought === "string") return s.thought;

    const p = params.value;
    if (p && typeof p.thought === "string") return p.thought;

    const o: any = parsedOutput.value as any;
    if (o && typeof o === "object") {
        if (typeof o.thought === "string") return o.thought;
        if (typeof o?.structuredContent?.thought === "string")
            return o.structuredContent.thought;
    }

    return null;
});

const hasThought = computed(
    () =>
        typeof thoughtText.value === "string" &&
        Boolean(thoughtText.value.trim()),
);

const progressValue = computed(() => {
    if (!seq.value) return 0;
    const total = seq.value.totalThoughts || 0;
    const current = seq.value.thoughtNumber || 0;
    if (total <= 0) return 0;
    const pct = Math.round((current / total) * 100);
    return Math.min(100, Math.max(0, pct));
});

const stepKind = computed(() => {
    const s = seq.value;
    if (!s) return "未知";
    if (s.isRevision) return "修正/回滚";
    if (
        (Array.isArray(s.branches) && s.branches.length > 0) ||
        s.branchId ||
        s.branchFromThought
    )
        return "分支探索";
    if (s.needsMoreThoughts) return "追加思考";
    if (!s.nextThoughtNeeded) return "收敛/完成";
    return "推进";
});

const scrubbedJson = computed(() => {
    const v = scrubThoughtDeep(parsedOutput.value);
    if (typeof v === "string") return v;
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
});

const scrubbedParamsJson = computed(() => {
    const v = scrubThoughtDeep(parsedInput.value);
    if (typeof v === "string") return v;
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
});

function yn(value: unknown) {
    return value ? "是" : "否";
}
</script>

<template>
    <div :class="cn(props.class)">
        <div
            v-if="props.errorText"
            class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
            {{ props.errorText }}
        </div>

        <Queue v-else>
            <QueueSection :defaultOpen="true">
                <QueueSectionTrigger>
                    <QueueSectionLabel
                        :count="seq?.totalThoughts"
                        label="Sequential Thinking"
                    />
                </QueueSectionTrigger>
                <QueueSectionContent>
                    <QueueList>
                        <QueueItem>
                            <div class="flex items-center gap-2">
                                <QueueItemIndicator
                                    :completed="
                                        typeof seq?.nextThoughtNeeded ===
                                            'boolean' && !seq.nextThoughtNeeded
                                    "
                                />
                                <QueueItemContent
                                    :completed="
                                        typeof seq?.nextThoughtNeeded ===
                                            'boolean' && !seq.nextThoughtNeeded
                                    "
                                >
                                    <span class="text-foreground">
                                        本步：{{ stepKind }}
                                    </span>
                                    <span
                                        v-if="seq"
                                        class="ml-2 text-muted-foreground"
                                    >
                                        {{ seq.thoughtNumber }} /
                                        {{ seq.totalThoughts }}（{{
                                            progressValue
                                        }}%）
                                    </span>
                                </QueueItemContent>
                            </div>
                            <QueueItemDescription v-if="seq">
                                需要下一步：{{ yn(seq.nextThoughtNeeded) }}；
                                历史长度：
                                <span
                                    v-if="
                                        typeof seq.thoughtHistoryLength ===
                                        'number'
                                    "
                                >
                                    {{ seq.thoughtHistoryLength }}
                                </span>
                                <span v-else>未知</span>
                            </QueueItemDescription>
                        </QueueItem>
                    </QueueList>

                    <div class="mt-2 rounded-md bg-muted/50 p-3">
                        <MemoizedMarkdown
                            v-if="hasThought"
                            :id="`sequential-thinking-queue-thought-${
                                seq?.thoughtNumber ?? 0
                            }`"
                            :content="thoughtText || ''"
                            class="text-sm"
                        />
                        <div v-else class="text-sm text-muted-foreground">
                            本次输出未包含 thought。
                        </div>
                    </div>
                </QueueSectionContent>
            </QueueSection>

            <QueueSection :defaultOpen="false">
                <QueueSectionTrigger>
                    <QueueSectionLabel label="Parameters Raw (Scrubbed)" />
                </QueueSectionTrigger>
                <QueueSectionContent>
                    <CodeBlock :code="scrubbedParamsJson" language="json" />
                </QueueSectionContent>
            </QueueSection>

            <QueueSection :defaultOpen="false">
                <QueueSectionTrigger>
                    <QueueSectionLabel label="Output Raw (Scrubbed)" />
                </QueueSectionTrigger>
                <QueueSectionContent>
                    <CodeBlock :code="scrubbedJson" language="json" />
                </QueueSectionContent>
            </QueueSection>
        </Queue>
    </div>
</template>
