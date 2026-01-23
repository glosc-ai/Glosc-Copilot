<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed, inject } from "vue";
import { cn } from "@/lib/utils";
import { terminalContextKey } from "./context";

defineOptions({
    name: "AiTerminalStatus",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();

const ctx = inject(terminalContextKey, null);
const isStreaming = computed(() => Boolean(ctx?.isStreaming.value));
</script>

<template>
    <div
        :class="
            cn(
                'inline-flex items-center gap-2 text-xs text-muted-foreground',
                props.class,
            )
        "
    >
        <span
            class="inline-block size-2 rounded-full"
            :class="
                isStreaming
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-muted-foreground/40'
            "
        />
        <span>{{ isStreaming ? "Streaming" : "Idle" }}</span>
    </div>
</template>
