<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitFileChanges",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        :class="cn('shrink-0 flex items-center gap-2 text-xs', props.class)"
        v-bind="$attrs"
    >
        <slot />
    </div>
</template>
