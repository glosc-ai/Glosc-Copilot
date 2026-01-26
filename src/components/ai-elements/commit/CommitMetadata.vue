<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitMetadata",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        :class="
            cn(
                'mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground',
                props.class,
            )
        "
        v-bind="$attrs"
    >
        <slot />
    </div>
</template>
