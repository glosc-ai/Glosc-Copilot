<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { HoverCardContent } from "@/components/ui/hover-card";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <HoverCardContent
        :class="
            cn(
                'w-[min(92vw,520px)] p-3 text-sm shadow-lg',
                'bg-popover text-popover-foreground border rounded-md',
                props.class,
            )
        "
        align="start"
        side="top"
    >
        <slot />
    </HoverCardContent>
</template>
