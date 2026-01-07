<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { computed, useSlots } from "vue";
import MemoizedMarkdown from "../message/MemoizedMarkdown.vue";

interface Props {
    class?: HTMLAttributes["class"];
    id?: string;
    content: string;
}

const props = defineProps<Props>();
const slots = useSlots();

const slotContent = computed<string | undefined>(() => {
    const nodes = slots.default?.() || [];
    let text = "";
    for (const node of nodes) {
        if (typeof node.children === "string") text += node.children;
    }
    return text || undefined;
});

const md = computed(() => (slotContent.value ?? props.content ?? "") as string);
</script>

<template>
    <CollapsibleContent
        :class="
            cn(
                'mt-4 text-sm',
                'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2',
                'data-[state=open]:slide-in-from-top-2 text-muted-foreground',
                'outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
                props.class
            )
        "
    >
        <MemoizedMarkdown
            :id="props.id ?? 'reasoning'"
            :content="md"
            class="prose prose-sm max-w-none"
        />
    </CollapsibleContent>
</template>
