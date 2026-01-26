<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommit",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        :class="
            cn(
                'not-prose w-full rounded-xl border bg-background shadow-xs',
                props.class,
            )
        "
        v-bind="$attrs"
    >
        <slot />
    </div>
</template>
