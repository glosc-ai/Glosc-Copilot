<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <img
        height="32"
        width="32"
        :class="cn('h-8 w-8 rounded border object-cover', props.class)"
        v-bind="$attrs"
    />
</template>
