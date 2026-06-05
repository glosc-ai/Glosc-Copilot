<script setup lang="ts">
import type { ToolUIPart } from "ai";
import type { HTMLAttributes } from "vue";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-vue-next";
import { computed, ref } from "vue";

const props = defineProps<{
    output: ToolUIPart["output"];
    errorText: ToolUIPart["errorText"];
    class?: HTMLAttributes["class"];
}>();

const maxPreviewLength = 240;
const resultDialogOpen = ref(false);

const showOutput = computed(
    () =>
        Boolean(props.errorText) ||
        (props.output !== undefined && props.output !== null),
);

const isObjectOutput = computed(
    () => typeof props.output === "object" && props.output !== null,
);

function previewString(text: string, emptyText = "空文本结果") {
    const trimmedText = text.trim();
    if (!trimmedText) {
        return emptyText;
    }

    return trimmedText.length > maxPreviewLength
        ? `${trimmedText.slice(0, maxPreviewLength)}...`
        : trimmedText;
}

function previewObject(output: object) {
    if (Array.isArray(output)) {
        return `数组结果，共 ${output.length} 项`;
    }

    const previewKeys: string[] = [];
    for (const key in output) {
        previewKeys.push(key);
        if (previewKeys.length >= 6) break;
    }

    if (previewKeys.length === 0) {
        return "对象结果";
    }

    const hasMore = previewKeys.length > 5;
    const shownKeys = hasMore ? previewKeys.slice(0, 5) : previewKeys;
    return `对象结果，包含 ${shownKeys.join("、")}${hasMore ? " 等字段" : ""}`;
}

const previewText = computed(() => {
    if (props.errorText) {
        return previewString(props.errorText, "空错误详情");
    }

    if (typeof props.output === "string") {
        return previewString(props.output);
    }

    if (isObjectOutput.value) {
        return previewObject(props.output as object);
    }

    return String(props.output);
});

const resultTypeText = computed(() => {
    if (props.errorText) return "错误详情";
    if (isObjectOutput.value) return "JSON 结果";
    return "文本结果";
});

const formattedOutput = computed(() => {
    if (props.errorText) {
        return props.errorText;
    }

    if (isObjectOutput.value) {
        try {
            return JSON.stringify(props.output, null, 2);
        } catch {
            return String(props.output);
        }
    }

    return props.output === undefined || props.output === null
        ? ""
        : String(props.output);
});
</script>

<template>
    <div
        v-if="showOutput"
        :class="cn('space-y-2 p-4', props.class)"
        v-bind="$attrs"
    >
        <h4
            class="font-medium text-muted-foreground text-xs uppercase tracking-wide"
        >
            {{ props.errorText ? "Error" : "Result" }}
        </h4>
        <div
            :class="
                cn(
                    'rounded-md border text-xs [&_table]:w-full',
                    props.errorText
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted/50 text-foreground',
                )
            "
        >
            <div class="flex items-start justify-between gap-3 p-3">
                <div class="min-w-0 flex-1">
                    <div class="text-[11px] text-muted-foreground">
                        {{ resultTypeText }}
                    </div>
                    <pre
                        class="mt-1 max-h-20 overflow-hidden whitespace-pre-wrap wrap-break-word font-mono text-xs leading-5"
                        >{{ previewText }}</pre
                    >
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    class="h-7 shrink-0 px-2 text-xs"
                    @click="resultDialogOpen = true"
                >
                    <Maximize2 class="size-3.5" />
                    查看完整内容
                </Button>
            </div>
        </div>

        <Dialog v-model:open="resultDialogOpen">
            <DialogContent
                v-if="resultDialogOpen"
                class="h-[80vh] w-[92vw] max-w-4xl grid-rows-[auto_minmax(0,1fr)] gap-0 p-0"
            >
                <DialogHeader class="border-b px-5 py-4 pr-12">
                    <DialogTitle>{{
                        props.errorText ? "工具错误" : "工具结果"
                    }}</DialogTitle>
                    <DialogDescription>
                        {{ resultTypeText }}
                    </DialogDescription>
                </DialogHeader>
                <div class="min-h-0 overflow-auto bg-muted/30">
                    <pre
                        class="m-0 whitespace-pre-wrap wrap-break-word p-4 font-mono text-xs leading-5 text-foreground"
                        >{{ formattedOutput }}</pre
                    >
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>
