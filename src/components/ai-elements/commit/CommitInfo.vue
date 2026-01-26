<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitInfo",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div :class="cn('min-w-0 flex-1', props.class)" v-bind="$attrs">
        <slot />
    </div>
</template>
