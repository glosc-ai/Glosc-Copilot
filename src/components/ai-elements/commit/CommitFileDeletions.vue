<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitFileDeletions",
});

const props = withDefaults(
    defineProps<{
        count: number;
        class?: HTMLAttributes["class"];
    }>(),
    {
        class: undefined,
    },
);
</script>

<template>
    <span
        :class="cn('font-mono text-rose-700 dark:text-rose-300', props.class)"
        v-bind="$attrs"
    >
        -{{ props.count }}
    </span>
</template>
