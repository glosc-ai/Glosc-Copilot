<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { provide, ref } from "vue";

import { Collapsible } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface TaskProps {
    defaultOpen?: boolean;
    class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<TaskProps>(), {
    defaultOpen: true,
});

const isOpen = ref(props.defaultOpen);

function toggleOpen() {
    isOpen.value = !isOpen.value;
}

provide("isOpen", isOpen);
provide("toggle", toggleOpen);
</script>

<template>
    <Collapsible v-model:open="isOpen" as-child v-bind="$attrs">
        <div :class="cn('rounded-lg border bg-background', props.class)">
            <slot :is-open="isOpen" :toggle="toggleOpen" />
        </div>
    </Collapsible>
</template>
