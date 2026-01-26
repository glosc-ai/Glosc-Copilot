<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon } from "lucide-vue-next";

defineOptions({
    name: "AiCommitFiles",
});

const props = withDefaults(
    defineProps<{
        /** 是否可折叠 */
        collapsible?: boolean;
        /** 默认展开 */
        defaultOpen?: boolean;
        /** 标题 */
        title?: string;
        class?: HTMLAttributes["class"];
    }>(),
    {
        collapsible: true,
        defaultOpen: false,
        title: "文件变更",
        class: undefined,
    },
);

const open = ref(Boolean(props.defaultOpen));
watch(
    () => props.defaultOpen,
    (v) => {
        open.value = Boolean(v);
    },
);
</script>

<template>
    <Collapsible
        v-if="props.collapsible"
        v-model:open="open"
        :class="cn('w-full', props.class)"
    >
        <CollapsibleTrigger
            class="flex w-full items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
            <span>{{ props.title }}</span>
            <ChevronDownIcon
                class="size-4 transition-transform data-[state=open]:rotate-180"
            />
        </CollapsibleTrigger>
        <CollapsibleContent class="mt-2">
            <div class="space-y-2">
                <slot />
            </div>
        </CollapsibleContent>
    </Collapsible>

    <div v-else :class="cn('space-y-2', props.class)">
        <slot />
    </div>
</template>
