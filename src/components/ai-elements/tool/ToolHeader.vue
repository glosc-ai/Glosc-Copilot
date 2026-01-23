<script setup lang="ts">
import type { ToolUIPart } from "ai";
import type { HTMLAttributes } from "vue";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-vue-next";
import StatusBadge from "./ToolStatusBadge.vue";

const props = defineProps<{
    title?: string;
    type: ToolUIPart["type"];
    state: ToolUIPart["state"];
    class?: HTMLAttributes["class"];
}>();

const name = computed(() => {
    if (props.title && String(props.title).trim()) return props.title;
    const t = String(props.type || "");
    if (t.startsWith("tool-"))
        return t.slice("tool-".length).split("_").join(" ");
    if (t === "dynamic-tool") return "tool";
    return t;
});
</script>

<template>
    <CollapsibleTrigger
        :class="
            cn(
                'flex w-full items-center justify-between gap-4 p-3',
                props.class,
            )
        "
        v-bind="$attrs"
    >
        <div class="flex items-center gap-2">
            <!-- <WrenchIcon class="size-4 text-muted-foreground" /> -->
            <StatusBadge :state="props.state" />
            <span class="font-medium text-sm">
                {{ name }}
            </span>
        </div>
        <ChevronDownIcon
            class="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
    </CollapsibleTrigger>
</template>
