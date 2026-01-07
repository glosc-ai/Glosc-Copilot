<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { computed, useSlots } from "vue";
import MemoizedMarkdown from "./MemoizedMarkdown.vue";

interface Props {
    id: string;
    content?: string;
    isStreaming?: boolean;
    class?: HTMLAttributes["class"];
}
const props = defineProps<Props>();

const slots = useSlots();
const slotContent = computed<string | undefined>(() => {
    const nodes = slots.default?.() || [];
    let text = "";
    for (const node of nodes) {
        if (typeof node.children === "string") text += node.children;
    }
    return text || undefined;
});

const md = computed(() => (slotContent.value ?? props.content ?? "") as string);
</script>

<template>
    <MemoizedMarkdown
        :id="props.id"
        :content="md"
        :is-streaming="props.isStreaming"
        :class="cn(props.class)"
        v-bind="$attrs"
    />
</template>
