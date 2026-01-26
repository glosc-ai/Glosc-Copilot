<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CopyIcon, CheckIcon } from "lucide-vue-next";

defineOptions({
    name: "AiCommitCopyButton",
});

const props = withDefaults(
    defineProps<{
        hash: string;
        timeout?: number;
        onCopy?: () => void;
        onError?: (error: unknown) => void;
        class?: HTMLAttributes["class"];
    }>(),
    {
        timeout: 1200,
        onCopy: undefined,
        onError: undefined,
        class: undefined,
    },
);

const copied = ref(false);
let timer: number | null = null;

async function copy() {
    try {
        if (!props.hash) return;
        await navigator.clipboard.writeText(props.hash);
        copied.value = true;
        props.onCopy?.();

        if (timer != null) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            timer = null;
            copied.value = false;
        }, props.timeout);
    } catch (error) {
        props.onError?.(error);
    }
}
</script>

<template>
    <Button
        type="button"
        variant="ghost"
        size="icon"
        :class="cn('h-8 w-8', props.class)"
        @click="copy"
        v-bind="$attrs"
    >
        <CheckIcon v-if="copied" class="size-4" />
        <CopyIcon v-else class="size-4" />
        <span class="sr-only">复制 hash</span>
    </Button>
</template>
