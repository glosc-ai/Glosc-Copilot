<script setup lang="ts">
import { cn } from "@/lib/utils";
import { cardContextKey, type CardVariant } from "./context";

const props = defineProps<{
    class?: string;
    /** 可选：覆盖从 Card 注入的 variant */
    variant?: CardVariant;
}>();

const cardContext = inject(cardContextKey, undefined);
const effectiveVariant = computed<CardVariant>(
    () => props.variant ?? cardContext?.variant.value ?? "default",
);
</script>

<template>
    <p
        :data-variant="effectiveVariant"
        :class="cn('text-sm text-muted-foreground', props.class)"
    >
        <slot />
    </p>
</template>
