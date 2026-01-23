<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { HoverCardTrigger } from "@/components/ui/hover-card";

const props = defineProps<{
    sources: string[];
    class?: HTMLAttributes["class"];
    label?: string;
}>();

const hostname = computed(() => {
    const first = props.sources?.[0];
    if (!first) return "mcp";
    try {
        if (first.startsWith("http://") || first.startsWith("https://")) {
            return new URL(first).hostname;
        }
    } catch {
        // ignore
    }
    return props.label || "mcp";
});

const count = computed(() => (props.sources?.length || 0) as number);
</script>

<template>
    <HoverCardTrigger as-child>
        <Badge
            :class="
                cn(
                    'ml-1 inline-flex cursor-pointer select-none items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    'bg-muted text-foreground hover:bg-muted/80',
                    props.class,
                )
            "
        >
            <span class="truncate max-w-32">{{ hostname }}</span>
            <span v-if="count > 1" class="opacity-70">+{{ count - 1 }}</span>
        </Badge>
    </HoverCardTrigger>
</template>
