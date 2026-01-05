<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <span
        :class="
            cn(
                'inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground',
                props.class
            )
        "
        v-bind="$attrs"
    >
        <slot />
    </span>
</template>
