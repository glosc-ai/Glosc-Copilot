<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { StreamMarkdown } from "streamdown-vue";
import { computed, useSlots } from "vue";

interface Props {
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

const shikiTheme = computed(() => {
    // 流式期间禁用高亮，避免每个增量都触发昂贵的 Shiki 处理
    if (props.isStreaming) return undefined;
    return {
        light: "github-light",
        dark: "github-dark",
    };
});
</script>

<template>
    <StreamMarkdown
        :shiki-theme="shikiTheme"
        :content="md"
        :class="
            cn(
                'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                props.class
            )
        "
        v-bind="$attrs"
    />
</template>
