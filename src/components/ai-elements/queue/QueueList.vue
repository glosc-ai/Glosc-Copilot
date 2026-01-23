<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div :class="cn('mt-2 -mb-1', props.class)" v-bind="$attrs">
        <div class="max-h-40 pr-4 overflow-y-auto">
            <ul>
                <slot />
            </ul>
        </div>
    </div>
</template>
