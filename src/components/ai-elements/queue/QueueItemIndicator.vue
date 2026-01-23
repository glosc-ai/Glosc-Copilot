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
        ? "border-muted-foreground/20 bg-muted-foreground/10"
        : "border-muted-foreground/50",
);
</script>

<template>
    <span
        :class="
            cn(
                'mt-0.5 inline-block size-2.5 rounded-full border',
                completedClass,
                props.class,
            )
        "
        v-bind="$attrs"
    />
</template>
