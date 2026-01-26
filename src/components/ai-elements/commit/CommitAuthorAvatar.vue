<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

defineOptions({
    name: "AiCommitAuthorAvatar",
});

const props = withDefaults(
    defineProps<{
        initials: string;
        src?: string;
        alt?: string;
        class?: HTMLAttributes["class"];
    }>(),
    {
        src: undefined,
        alt: "avatar",
        class: undefined,
    },
);

const initialsText = computed(() => String(props.initials ?? "").slice(0, 2));
</script>

<template>
    <Avatar :class="cn('size-8', props.class)" v-bind="$attrs">
        <AvatarImage v-if="props.src" :src="props.src" :alt="props.alt" />
        <AvatarFallback
            class="bg-muted text-muted-foreground font-medium text-xs"
        >
            {{ initialsText }}
        </AvatarFallback>
    </Avatar>
</template>
