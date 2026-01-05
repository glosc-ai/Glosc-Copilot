<script setup lang="ts">
import type { HTMLAttributes, Ref } from "vue";
import { inject } from "vue";

import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-vue-next";

interface TaskTriggerProps {
    title?: string;
    class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<TaskTriggerProps>(), {
    title: "",
});

const isOpen = inject<Ref<boolean> | undefined>("isOpen");
</script>

<template>
    <CollapsibleTrigger as-child>
        <button
            type="button"
            :class="
                cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left',
                    props.class
                )
            "
        >
            <span class="min-w-0 flex-1 truncate text-sm font-medium">
                {{ props.title }}
            </span>
            <ChevronDownIcon
                :class="
                    cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform',
                        isOpen ? 'rotate-180' : ''
                    )
                "
            />
        </button>
    </CollapsibleTrigger>
</template>
