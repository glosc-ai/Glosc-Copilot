<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed, inject } from "vue";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Copy } from "lucide-vue-next";
import { terminalContextKey } from "./context";

defineOptions({
    name: "AiTerminalCopyButton",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
    onCopy?: () => void;
    title?: string;
}>();

const ctx = inject(terminalContextKey, null);
const output = computed(() => String(ctx?.output.value ?? ""));

async function copy() {
    try {
        await navigator.clipboard.writeText(output.value);
        props.onCopy?.();
        // Element Plus auto-import is enabled in this repo
        ElMessage.success("已复制");
    } catch {
        // ignore
    }
}
</script>

<template>
    <Button
        variant="ghost"
        size="icon"
        type="button"
        :class="cn('h-8 w-8', props.class)"
        :title="props.title || '复制'"
        @click="copy"
    >
        <Copy class="h-4 w-4" />
    </Button>
</template>
