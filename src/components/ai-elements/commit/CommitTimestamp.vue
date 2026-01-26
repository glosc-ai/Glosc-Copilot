<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiCommitTimestamp",
});

const props = withDefaults(
    defineProps<{
        date: Date | number | string;
        class?: HTMLAttributes["class"];
    }>(),
    {
        class: undefined,
    },
);

function toDate(input: Date | number | string): Date | null {
    if (input instanceof Date) return input;
    if (typeof input === "number") {
        const d = new Date(input);
        return Number.isFinite(d.getTime()) ? d : null;
    }
    const d = new Date(input);
    return Number.isFinite(d.getTime()) ? d : null;
}

function formatRelative(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 5) return "刚刚";
    if (diffSec < 60) return `${diffSec} 秒前`;

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} 分钟前`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小时前`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} 天前`;

    return date.toLocaleString();
}

const dateObj = computed(() => toDate(props.date));

const text = computed(() => {
    if (!dateObj.value) return "";
    return formatRelative(dateObj.value);
});
</script>

<template>
    <span
        :class="cn('text-xs text-muted-foreground', props.class)"
        v-bind="$attrs"
        :title="dateObj ? dateObj.toLocaleString() : ''"
    >
        <slot v-if="$slots.default" />
        <template v-else>{{ text }}</template>
    </span>
</template>
