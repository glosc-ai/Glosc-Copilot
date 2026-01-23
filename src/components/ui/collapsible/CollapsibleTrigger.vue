<script setup lang="ts">
import type { CollapsibleTriggerProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { reactiveOmit } from "@vueuse/core";
import { CollapsibleTrigger, useForwardProps } from "reka-ui";

defineOptions({
    inheritAttrs: false,
});

const props = defineProps<
    CollapsibleTriggerProps & { class?: HTMLAttributes["class"] }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
    <CollapsibleTrigger
        data-slot="collapsible-trigger"
        v-bind="{ ...$attrs, ...forwardedProps }"
        :class="cn('transition-colors', props.class)"
    >
        <slot />
    </CollapsibleTrigger>
</template>
