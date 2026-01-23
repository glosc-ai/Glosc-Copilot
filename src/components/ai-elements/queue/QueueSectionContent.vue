<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <CollapsibleContent :class="cn(props.class)" v-bind="$attrs">
        <slot />
    </CollapsibleContent>
</template>
