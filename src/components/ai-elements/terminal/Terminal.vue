<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed, provide } from "vue";

import { cn } from "@/lib/utils";
import { terminalContextKey, type TerminalContext } from "./context";

defineOptions({
    name: "AiTerminal",
});

const props = withDefaults(
    defineProps<{
        output: string;
        isStreaming?: boolean;
        autoScroll?: boolean;
        onClear?: () => void;
        class?: HTMLAttributes["class"];
    }>(),
    {
        isStreaming: false,
        autoScroll: true,
        onClear: undefined,
        class: undefined,
    },
);

const ctx: TerminalContext = {
    output: computed(() => String(props.output ?? "")) as any,
    isStreaming: computed(() => Boolean(props.isStreaming)) as any,
    autoScroll: computed(() => Boolean(props.autoScroll)) as any,
    onClear: props.onClear,
};

provide(terminalContextKey, ctx);
</script>

<template>
    <div
        :class="
            cn(
                'flex h-full w-full flex-col overflow-hidden rounded-xl border bg-background shadow-xs',
                props.class,
            )
        "
        v-bind="$attrs"
    >
        <slot />
    </div>
</template>
