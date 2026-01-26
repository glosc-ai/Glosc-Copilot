<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitFileAdditions",
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
        :class="
            cn('font-mono text-emerald-700 dark:text-emerald-300', props.class)
        "
        v-bind="$attrs"
    >
        +{{ props.count }}
    </span>
</template>
