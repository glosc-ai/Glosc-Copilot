<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { inject } from "vue";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-vue-next";
import { terminalContextKey } from "./context";

defineOptions({
    name: "AiTerminalClearButton",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
    title?: string;
}>();

const ctx = inject(terminalContextKey, null);

function clear() {
    ctx?.onClear?.();
}
</script>

<template>
    <Button
        variant="ghost"
        size="icon"
        type="button"
        :class="cn('h-8 w-8', props.class)"
        :title="props.title || '清空'"
        @click="clear"
    >
        <Trash2 class="h-4 w-4" />
    </Button>
</template>
