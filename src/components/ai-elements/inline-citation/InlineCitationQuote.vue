<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        :class="
            cn(
                'mt-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground',
                'max-h-56 overflow-auto whitespace-pre-wrap',
                props.class,
            )
        "
    >
        <slot />
    </div>
</template>
