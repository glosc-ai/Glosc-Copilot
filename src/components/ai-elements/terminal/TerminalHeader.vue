<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiTerminalHeader",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <div
        :class="
            cn(
                'shrink-0 border-b bg-muted/10 px-3 py-2 flex items-center justify-between gap-2',
                props.class,
            )
        "
    >
        <slot />
    </div>
</template>
