<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitHash",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <span
        :class="cn('font-mono text-xs text-muted-foreground', props.class)"
        v-bind="$attrs"
    >
        <slot />
    </span>
</template>
