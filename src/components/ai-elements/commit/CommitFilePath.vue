<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitFilePath",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <span
        :class="
            cn(
                'min-w-0 truncate font-mono text-xs text-foreground',
                props.class,
            )
        "
        v-bind="$attrs"
    >
        <slot />
    </span>
</template>
