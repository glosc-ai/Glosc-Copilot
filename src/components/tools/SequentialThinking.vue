<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed, ref } from "vue";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CodeBlock } from "@/components/ai-elements/code-block";
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

const rawOpen = ref(false);
const paramsRawOpen = ref(false);

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
    value: unknown
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
    value: unknown
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
            next[key] = "（已隐藏：推理细节不在 UI 中直接展示）";
            continue;
        }
        next[key] = scrubThoughtDeep(val, depth + 1);
    }
    return next;
}

const parsedOutput = computed(() => {
    const parsed = tryParseJson(props.output);
    return parsed;
});

const parsedInput = computed(() => {
    const parsed = tryParseJson(props.input);
    return parsed;
});

const params = computed<SequentialThinkingStructured | null>(() => {
    return extractStructured(parsedInput.value);
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

const seq = computed<SequentialThinkingStructured | null>(() => {
    return extractStructured(parsedOutput.value);
});

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

function yn(value: unknown) {
    return value ? "是" : "否";
}
</script>

<template>
    <div :class="cn('space-y-3 p-4', props.class)">
        <h4
            class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
        >
            Sequential Thinking
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
                    Parameters
                </h5>

                <div
                    class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-muted/50 p-3 text-sm"
                >
                    <template v-if="params">
                        <div class="text-muted-foreground">步骤</div>
                        <div>
                            {{ params.thoughtNumber }} /
                            {{ params.totalThoughts }}
                        </div>

                        <div class="text-muted-foreground">需要下一步</div>
                        <div>{{ yn(params.nextThoughtNeeded) }}</div>

                        <div class="text-muted-foreground">是否修正</div>
                        <div>
                            <span v-if="typeof params.isRevision === 'boolean'">
                                {{ yn(params.isRevision) }}
                            </span>
                            <span v-else class="text-muted-foreground"
                                >未知</span
                            >
                            <span
                                v-if="
                                    params.isRevision && params.revisesThought
                                "
                                class="text-muted-foreground"
                            >
                                （修正第 {{ params.revisesThought }} 步）
                            </span>
                        </div>

                        <div class="text-muted-foreground">分支</div>
                        <div>
                            <template
                                v-if="
                                    (Array.isArray(params.branches) &&
                                        params.branches.length > 0) ||
                                    params.branchId ||
                                    params.branchFromThought
                                "
                            >
                                <span v-if="Array.isArray(params.branches)">
                                    {{ params.branches.length }} 条
                                </span>
                                <span
                                    v-else-if="
                                        params.branchId ||
                                        params.branchFromThought
                                    "
                                >
                                    {{ params.branchId || "未命名" }}
                                </span>
                                <span
                                    v-if="params.branchFromThought"
                                    class="text-muted-foreground"
                                >
                                    （从第
                                    {{ params.branchFromThought }} 步分支）
                                </span>
                            </template>
                            <span v-else class="text-muted-foreground">无</span>
                        </div>

                        <div class="text-muted-foreground">思考内容</div>
                        <div class="text-muted-foreground">
                            <span v-if="typeof params.thought === 'string'">
                                已隐藏（避免在 UI 中直接展示推理细节）
                            </span>
                            <span v-else>本次参数未包含 thought</span>
                        </div>
                    </template>
                    <template v-else>
                        <div class="col-span-2 text-muted-foreground">
                            参数不符合 sequentialthinking 结构，已提供脱敏 Raw。
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

            <div class="space-y-2">
                <div class="flex items-center justify-between gap-3 text-sm">
                    <div class="font-medium">本步：{{ stepKind }}</div>
                    <div v-if="seq" class="text-muted-foreground">
                        {{ seq.thoughtNumber }} / {{ seq.totalThoughts }}（{{
                            progressValue
                        }}%）
                    </div>
                </div>
                <Progress :modelValue="progressValue" />
            </div>

            <div
                class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-muted/50 p-3 text-sm"
            >
                <template v-if="seq">
                    <div class="text-muted-foreground">需要下一步</div>
                    <div>{{ yn(seq.nextThoughtNeeded) }}</div>

                    <div class="text-muted-foreground">需要更多思考</div>
                    <div>
                        <span
                            v-if="typeof seq.needsMoreThoughts === 'boolean'"
                            >{{ yn(seq.needsMoreThoughts) }}</span
                        >
                        <span v-else class="text-muted-foreground">未知</span>
                    </div>

                    <div class="text-muted-foreground">是否修正</div>
                    <div>
                        <span v-if="typeof seq.isRevision === 'boolean'">{{
                            yn(seq.isRevision)
                        }}</span>
                        <span v-else class="text-muted-foreground">未知</span>
                        <span
                            v-if="seq.isRevision && seq.revisesThought"
                            class="text-muted-foreground"
                        >
                            （修正第 {{ seq.revisesThought }} 步）
                        </span>
                    </div>

                    <div class="text-muted-foreground">分支</div>
                    <div>
                        <template
                            v-if="
                                (Array.isArray(seq.branches) &&
                                    seq.branches.length > 0) ||
                                seq.branchId ||
                                seq.branchFromThought
                            "
                        >
                            <span v-if="Array.isArray(seq.branches)">
                                {{ seq.branches.length }} 条
                            </span>
                            <span
                                v-else-if="
                                    seq.branchId || seq.branchFromThought
                                "
                            >
                                {{ seq.branchId || "未命名" }}
                            </span>
                            <span
                                v-if="seq.branchFromThought"
                                class="text-muted-foreground"
                            >
                                （从第 {{ seq.branchFromThought }} 步分支）
                            </span>
                        </template>
                        <span v-else class="text-muted-foreground"> 无 </span>
                    </div>

                    <div class="text-muted-foreground">历史长度</div>
                    <div>
                        <span
                            v-if="typeof seq.thoughtHistoryLength === 'number'"
                        >
                            {{ seq.thoughtHistoryLength }}
                        </span>
                        <span v-else class="text-muted-foreground">未知</span>
                    </div>

                    <div class="text-muted-foreground">思考内容</div>
                    <div class="text-muted-foreground">
                        <span v-if="typeof seq.thought === 'string'">
                            已隐藏（避免在 UI 中直接展示推理细节）
                        </span>
                        <span v-else> 本次输出未包含 thought </span>
                    </div>
                </template>
                <template v-else>
                    <div class="col-span-2 text-muted-foreground">
                        输出不符合 sequentialthinking
                        结构，已显示脱敏后的原始数据。
                    </div>
                </template>
            </div>

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
