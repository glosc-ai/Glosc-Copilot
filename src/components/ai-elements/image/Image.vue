<script setup lang="ts">
import type { Experimental_GeneratedImage } from "ai";
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { computed, onBeforeUnmount, ref } from "vue";

interface Props extends Experimental_GeneratedImage {
    class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();

const previewOpen = ref(false);
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
const dragging = ref(false);
const dragStartClientX = ref(0);
const dragStartClientY = ref(0);
const dragStartTranslateX = ref(0);
const dragStartTranslateY = ref(0);

const classes = computed(() =>
    cn("h-auto max-w-full overflow-hidden rounded-md", props.class)
);

const src = computed(() => {
    if (props.base64.startsWith("data:")) {
        return props.base64;
    }
    return `data:${props.mediaType};base64,${props.base64}`;
});

const previewStyle = computed(() => ({
    transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
    transformOrigin: "center center",
}));

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

const resetView = () => {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
};

const closePreview = () => {
    previewOpen.value = false;
    dragging.value = false;
    resetView();
    cleanupWindowListeners();
};

const openPreview = () => {
    previewOpen.value = true;
    resetView();
    addWindowListeners();
};

const onKeyDown = (e: KeyboardEvent) => {
    if (!previewOpen.value) return;
    if (e.key === "Escape") {
        e.preventDefault();
        closePreview();
    }
};

const onMouseMove = (e: MouseEvent) => {
    if (!previewOpen.value || !dragging.value) return;
    translateX.value =
        dragStartTranslateX.value + (e.clientX - dragStartClientX.value);
    translateY.value =
        dragStartTranslateY.value + (e.clientY - dragStartClientY.value);
};

const onMouseUp = () => {
    dragging.value = false;
};

const addWindowListeners = () => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
};

const cleanupWindowListeners = () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
};

const onPreviewMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    dragging.value = true;
    dragStartClientX.value = e.clientX;
    dragStartClientY.value = e.clientY;
    dragStartTranslateX.value = translateX.value;
    dragStartTranslateY.value = translateY.value;
};

const onPreviewWheel = (e: WheelEvent) => {
    if (!previewOpen.value) return;
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    const factor = direction > 0 ? 1.1 : 0.9;
    scale.value = clamp(scale.value * factor, 0.2, 5);
};

onBeforeUnmount(() => {
    cleanupWindowListeners();
});
</script>

<template>
    <img
        :class="cn(classes, 'cursor-zoom-in')"
        :src="src"
        v-bind="$attrs"
        draggable="false"
        @click="openPreview"
    />

    <div
        v-if="previewOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        @click.self="closePreview"
        @wheel="onPreviewWheel"
    >
        <img
            :src="src"
            :alt="($attrs as any)?.alt"
            draggable="false"
            class="max-h-[90vh] max-w-[90vw] select-none"
            :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
            :style="previewStyle"
            @mousedown.prevent="onPreviewMouseDown"
        />
    </div>
</template>
