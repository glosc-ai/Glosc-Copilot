<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitAuthor",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div :class="cn('shrink-0', props.class)" v-bind="$attrs">
        <slot />
    </div>
</template>
