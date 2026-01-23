<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed, inject, nextTick, ref, watch } from "vue";

import { cn } from "@/lib/utils";
import { terminalContextKey } from "./context";
import { parseAnsiToSegments } from "./ansi";

defineOptions({
    name: "AiTerminalContent",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
    containerClass?: HTMLAttributes["class"];
}>();

const ctx = inject(terminalContextKey, null);
const containerRef = ref<HTMLElement | null>(null);

const output = computed(() => String(ctx?.output.value ?? ""));
const autoScroll = computed(() => Boolean(ctx?.autoScroll.value));

const segments = computed(() => parseAnsiToSegments(output.value));

watch(
    () => output.value,
    async () => {
        if (!autoScroll.value) return;
        await nextTick();
        const el = containerRef.value;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    },
);
</script>

<template>
    <div
        ref="containerRef"
        :class="
            cn(
                'flex-1 min-h-0 overflow-auto bg-background',
                'px-3 py-2',
                props.containerClass,
            )
        "
    >
        <div
            :class="
                cn(
                    'font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-break-word',
                    props.class,
                )
            "
        >
            <template v-for="(seg, i) in segments" :key="i">
                <span :class="seg.className" :style="seg.style" :data-seg-idx="i">{{ seg.text }}</span>
            </template>
        </div>
        <slot />
    </div>
</template>
