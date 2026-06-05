<script setup lang="ts">
import type { ToolUIPart } from "ai";
import type { HTMLAttributes } from "vue";
import { Collapsible } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useVModel } from "@vueuse/core";
import { computed, onBeforeUnmount, ref, watch } from "vue";

interface Props {
    class?: HTMLAttributes["class"];
    state?: ToolUIPart["state"];
    open?: boolean;
    defaultOpen?: boolean;
    autoCollapse?: boolean;
    autoCollapseDelay?: number;
}

const props = withDefaults(defineProps<Props>(), {
    defaultOpen: true,
    autoCollapse: true,
    autoCollapseDelay: 1200,
});

const emit = defineEmits<{
    (event: "update:open", value: boolean): void;
}>();

const isOpen = useVModel(props, "open", emit, {
    defaultValue: props.defaultOpen,
    passive: true,
});

const hasAutoCollapsed = ref(false);
const userChangedOpenAfterCompletion = ref(false);
let autoCollapseTimer: number | null = null;

const isActiveState = computed(
    () =>
        props.state === "input-streaming" ||
        props.state === "input-available" ||
        props.state === "approval-requested" ||
        props.state === "approval-responded",
);

const isCompletedState = computed(
    () =>
        props.state === "output-available" ||
        props.state === "output-error" ||
        props.state === "output-denied",
);

function clearAutoCollapseTimer() {
    if (autoCollapseTimer == null) return;
    window.clearTimeout(autoCollapseTimer);
    autoCollapseTimer = null;
}

function handleOpenUpdate(value: boolean) {
    isOpen.value = value;
    if (isCompletedState.value) {
        userChangedOpenAfterCompletion.value = true;
        clearAutoCollapseTimer();
    }
}

watch(
    () => props.state,
    () => {
        clearAutoCollapseTimer();

        if (isActiveState.value) {
            isOpen.value = true;
            hasAutoCollapsed.value = false;
            userChangedOpenAfterCompletion.value = false;
            return;
        }

        if (
            props.autoCollapse &&
            isCompletedState.value &&
            isOpen.value &&
            !hasAutoCollapsed.value &&
            !userChangedOpenAfterCompletion.value
        ) {
            autoCollapseTimer = window.setTimeout(() => {
                isOpen.value = false;
                hasAutoCollapsed.value = true;
                autoCollapseTimer = null;
            }, props.autoCollapseDelay);
        }
    },
    { immediate: true },
);

onBeforeUnmount(clearAutoCollapseTimer);
</script>

<template>
    <Collapsible
        :open="isOpen"
        @update:open="handleOpenUpdate"
        :class="cn('not-prose mb-4 w-full rounded-md ', props.class)"
        v-bind="$attrs"
    >
        <slot />
    </Collapsible>
</template>
