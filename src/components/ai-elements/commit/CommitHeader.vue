<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitHeader",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        :class="
            cn(
                'flex items-start justify-between gap-3 border-b px-4 py-3',
                props.class,
            )
        "
        v-bind="$attrs"
    >
        <div class="min-w-0 flex items-start gap-3">
            <slot />
        </div>
    </div>
</template>
