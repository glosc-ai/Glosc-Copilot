<script setup lang="ts">
import { cn } from "@/lib/utils";
import { cardContextKey, type CardVariant } from "./context";

const props = withDefaults(
    defineProps<{
        class?: string;
        variant?: CardVariant;
        /**
         * 启用后，组件会根据 collapsed 在折叠/展开时应用过渡动画。
         * 默认不启用，以保持现有行为不变。
         */
        collapsible?: boolean;
        /** 折叠状态：true=折叠(隐藏内容)，false=展开(显示内容) */
        collapsed?: boolean;
        /** 过渡时长（毫秒） */
        durationMs?: number;
    }>(),
    {
        variant: "default",
        collapsible: false,
        collapsed: false,
        durationMs: 200,
    },
);

provide(cardContextKey, {
    variant: computed(() => props.variant),
});

const cardClass = computed(() =>
    cn(
        "rounded-lg text-card-foreground",
        props.variant === "default" && "border bg-card shadow-sm",
        props.variant === "outline" &&
            "border border-border bg-transparent shadow-none",
        props.class,
    ),
);

function setTransition(el: HTMLElement, enabled: boolean) {
    if (!enabled) {
        el.style.transition = "";
        return;
    }
    const ms = Math.max(0, props.durationMs);
    el.style.transition = `height ${ms}ms ease, opacity ${ms}ms ease`;
}

function beforeEnter(el: Element) {
    const element = el as HTMLElement;
    element.style.overflow = "hidden";
    element.style.height = "0";
    element.style.opacity = "0";
    setTransition(element, true);
}

function enter(el: Element, done: () => void) {
    const element = el as HTMLElement;
    const targetHeight = element.scrollHeight;
    requestAnimationFrame(() => {
        element.style.height = `${targetHeight}px`;
        element.style.opacity = "1";
    });
    const ms = Math.max(0, props.durationMs);
    window.setTimeout(() => {
        element.style.height = "";
        element.style.opacity = "";
        element.style.overflow = "";
        setTransition(element, false);
        done();
    }, ms);
}

function beforeLeave(el: Element) {
    const element = el as HTMLElement;
    element.style.overflow = "hidden";
    element.style.height = `${element.scrollHeight}px`;
    element.style.opacity = "1";
    setTransition(element, true);
}

function leave(el: Element, done: () => void) {
    const element = el as HTMLElement;
    requestAnimationFrame(() => {
        element.style.height = "0";
        element.style.opacity = "0";
    });
    const ms = Math.max(0, props.durationMs);
    window.setTimeout(() => {
        element.style.height = "";
        element.style.opacity = "";
        element.style.overflow = "";
        setTransition(element, false);
        done();
    }, ms);
}
</script>

<template>
    <div :class="cardClass">
        <Transition
            v-if="props.collapsible"
            @before-enter="beforeEnter"
            @enter="enter"
            @before-leave="beforeLeave"
            @leave="leave"
        >
            <div v-show="!props.collapsed">
                <slot />
            </div>
        </Transition>

        <slot v-else />
    </div>
</template>
