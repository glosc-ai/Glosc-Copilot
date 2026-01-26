<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

export type CommitFileStatusType = "added" | "modified" | "deleted" | "renamed";

defineOptions({
    name: "AiCommitFileStatus",
});

const props = withDefaults(
    defineProps<{
        status: CommitFileStatusType;
        class?: HTMLAttributes["class"];
    }>(),
    {
        class: undefined,
    },
);

const badgeText = computed(() => {
    const map: Record<CommitFileStatusType, string> = {
        added: "A",
        modified: "M",
        deleted: "D",
        renamed: "R",
    };
    return map[props.status];
});

const badgeClass = computed(() => {
    const map: Record<CommitFileStatusType, string> = {
        added: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        modified: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        deleted: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
        renamed: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    };
    return map[props.status];
});
</script>

<template>
    <span
        :class="
            cn(
                'inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold',
                badgeClass,
                props.class,
            )
        "
        v-bind="$attrs"
        :title="props.status"
    >
        <slot v-if="$slots.default" />
        <template v-else>{{ badgeText }}</template>
    </span>
</template>
