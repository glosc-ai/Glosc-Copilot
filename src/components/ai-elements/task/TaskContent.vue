<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <CollapsibleContent :class="cn('px-3 pb-3', props.class)" v-bind="$attrs">
        <div class="pt-1">
            <slot />
        </div>
    </CollapsibleContent>
</template>
