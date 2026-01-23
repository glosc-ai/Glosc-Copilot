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
        ? "text-muted-foreground/40 line-through"
        : "text-muted-foreground",
);
</script>

<template>
    <div
        :class="cn('ml-6 text-xs', completedClass, props.class)"
        v-bind="$attrs"
    >
        <slot />
    </div>
</template>
