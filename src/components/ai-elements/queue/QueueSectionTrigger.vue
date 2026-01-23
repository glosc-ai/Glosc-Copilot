<script setup lang="ts">
import type { HTMLAttributes } from "vue";

import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <CollapsibleTrigger as-child>
        <button
            type="button"
            :class="
                cn(
                    'group flex w-full items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-left font-medium text-muted-foreground text-sm transition-colors hover:bg-muted',
                    props.class,
                )
            "
            v-bind="$attrs"
        >
            <slot />
        </button>
    </CollapsibleTrigger>
</template>
