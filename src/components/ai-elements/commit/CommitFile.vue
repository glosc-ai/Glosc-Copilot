<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitFile",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        :class="
            cn(
                'flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2',
                props.class,
            )
        "
        v-bind="$attrs"
    >
        <slot />
    </div>
</template>
