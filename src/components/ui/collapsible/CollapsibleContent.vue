<script setup lang="ts">
import type { CollapsibleContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { reactiveOmit } from "@vueuse/core";
import { CollapsibleContent, useForwardProps } from "reka-ui";

defineOptions({
    inheritAttrs: false,
});

const props = defineProps<
    CollapsibleContentProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
    <CollapsibleContent
        data-slot="collapsible-content"
        v-bind="{ ...$attrs, ...forwardedProps }"
        :class="
            cn(
                'collapsible-content-anim overflow-hidden will-change-[height]',
                props.class,
            )
        "
    >
        <slot />
    </CollapsibleContent>
</template>

<style scoped>
@keyframes collapsible-down {
    from {
        height: 0;
        opacity: 0.2;
    }
    to {
        height: var(--reka-collapsible-content-height);
        opacity: 1;
    }
}

@keyframes collapsible-up {
    from {
        height: var(--reka-collapsible-content-height);
        opacity: 1;
    }
    to {
        height: 0;
        opacity: 0;
    }
}

.collapsible-content-anim[data-state="open"] {
    animation: collapsible-down 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.collapsible-content-anim[data-state="closed"] {
    animation: collapsible-up 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
    .collapsible-content-anim[data-state="open"],
    .collapsible-content-anim[data-state="closed"] {
        animation: none;
    }
}
</style>
