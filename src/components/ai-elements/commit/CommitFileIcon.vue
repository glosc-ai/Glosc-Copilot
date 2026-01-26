<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { FileIcon } from "lucide-vue-next";

defineOptions({
    name: "AiCommitFileIcon",
});

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();
</script>

<template>
    <FileIcon
        :class="cn('size-4 text-muted-foreground', props.class)"
        v-bind="$attrs"
    />
</template>
