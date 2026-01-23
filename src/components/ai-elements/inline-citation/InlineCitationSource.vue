<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { ExternalLink, Copy } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

const props = defineProps<{
    title: string;
    url: string;
    description?: string;
    class?: HTMLAttributes["class"];
}>();

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        ElMessage.success("已复制");
    } catch {
        // ignore
    }
}

function open() {
    try {
        if (
            props.url.startsWith("http://") ||
            props.url.startsWith("https://")
        ) {
            window.open(props.url, "_blank", "noreferrer");
        } else {
            void copy(props.url);
        }
    } catch {
        void copy(props.url);
    }
}
</script>

<template>
    <div :class="cn('space-y-1', props.class)">
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
                <div class="font-medium leading-snug break-words">
                    {{ props.title }}
                </div>
                <div class="text-xs text-muted-foreground break-all">
                    {{ props.url }}
                </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7"
                    @click="open"
                >
                    <ExternalLink class="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7"
                    @click="copy(props.url)"
                >
                    <Copy class="h-4 w-4" />
                </Button>
            </div>
        </div>
        <div v-if="props.description" class="text-xs text-muted-foreground">
            {{ props.description }}
        </div>
    </div>
</template>
