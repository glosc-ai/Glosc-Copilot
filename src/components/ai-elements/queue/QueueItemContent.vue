<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";

import { cn } from "@/lib/utils";

const props = withDefaults(
    defineProps<{
        completed?: boolean;
        class?: HTMLAttributes["class"];
    }>(),
    {
        completed: false,
    },
);

const completedClass = computed(() =>
    props.completed
        ? "text-muted-foreground/50 line-through"
        : "text-muted-foreground",
);
</script>

<template>
    <span
        :class="
            cn('line-clamp-1 grow break-words', completedClass, props.class)
        "
        v-bind="$attrs"
    >
        <slot />
    </span>
</template>
