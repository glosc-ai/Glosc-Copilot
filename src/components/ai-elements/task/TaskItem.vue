<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        :class="cn('flex items-start gap-2 text-sm', props.class)"
        v-bind="$attrs"
    >
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
        <div class="min-w-0 flex-1 leading-relaxed">
            <slot />
        </div>
    </div>
</template>
