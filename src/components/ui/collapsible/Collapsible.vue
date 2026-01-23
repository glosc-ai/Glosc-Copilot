<script setup lang="ts">
import type { CollapsibleRootEmits, CollapsibleRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { reactiveOmit } from "@vueuse/core";
import { CollapsibleRoot, useForwardPropsEmits } from "reka-ui";

defineOptions({
    inheritAttrs: false,
});

const props = defineProps<
    CollapsibleRootProps & { class?: HTMLAttributes["class"] }
>();
const emits = defineEmits<CollapsibleRootEmits>();

const delegatedProps = reactiveOmit(props, "class");
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
    <CollapsibleRoot
        v-slot="slotProps"
        data-slot="collapsible"
        v-bind="{ ...$attrs, ...forwarded }"
        :class="cn(props.class)"
    >
        <slot v-bind="slotProps" />
    </CollapsibleRoot>
</template>
