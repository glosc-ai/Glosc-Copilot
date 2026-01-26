<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitContent",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div :class="cn('px-4 py-3', props.class)" v-bind="$attrs">
        <slot />
    </div>
</template>
