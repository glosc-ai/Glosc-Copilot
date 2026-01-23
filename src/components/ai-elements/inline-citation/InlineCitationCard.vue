<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { HoverCard } from "@/components/ui/hover-card";

const props = defineProps<{
    class?: HTMLAttributes["class"];
    openDelay?: number;
    closeDelay?: number;
}>();
</script>

<template>
    <HoverCard
        :open-delay="props.openDelay ?? 80"
        :close-delay="props.closeDelay ?? 100"
        :class="cn(props.class)"
    >
        <slot />
    </HoverCard>
</template>
