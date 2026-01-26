<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitMessage",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        :class="cn('truncate font-medium text-sm text-foreground', props.class)"
        v-bind="$attrs"
    >
        <slot />
    </div>
</template>
