<script setup lang="ts">
import type { HTMLAttributes, Ref } from "vue";
import { computed, inject } from "vue";

import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-vue-next";

const props = defineProps<{
    label: string;
    count?: number;
    class?: HTMLAttributes["class"];
}>();

const isOpen = inject<Ref<boolean> | undefined>("queue:isOpen");
const chevronClass = computed(() =>
    isOpen?.value ? "rotate-0" : "-rotate-90",
);
</script>

<template>
    <span :class="cn('flex items-center gap-2', props.class)" v-bind="$attrs">
        <ChevronDownIcon
            :class="cn('size-4 transition-transform', chevronClass)"
        />
        <slot name="icon" />
        <span>
            <template v-if="typeof props.count === 'number'">
                {{ props.count }}
            </template>
            {{ props.label }}
        </span>
    </span>
</template>
