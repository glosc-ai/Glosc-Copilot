<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, computed } from "vue";
import { cn } from "@/lib/utils";

interface Props {
    provider: string;
    class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();

const failed = ref(false);

const logoSrc = computed(() => {
    const p = String(props.provider || "unknown");
    // models.dev 路径段需要可 URL 安全
    return `https://models.dev/logos/${encodeURIComponent(p)}.svg`;
});

const fallbackText = computed(() => {
    const p = String(props.provider || "").trim();
    if (!p) return "?";
    return p.slice(0, 1).toUpperCase();
});
</script>

<template>
    <span
        v-if="failed"
        v-bind="$attrs"
        :class="
            cn(
                'inline-flex items-center justify-center size-3 rounded-full bg-muted text-[8px] text-muted-foreground',
                props.class,
            )
        "
        :title="props.provider"
    >
        {{ fallbackText }}
    </span>

    <img
        v-else
        v-bind="$attrs"
        :alt="`${props.provider} logo`"
        :class="cn('size-3 dark:invert', props.class)"
        height="12"
        :src="logoSrc"
        width="12"
        @error="failed = true"
    />
</template>
