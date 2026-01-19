<script setup lang="ts">
<<<<<<< HEAD
<<<<<<< HEAD
import { computed } from "vue";
=======
>>>>>>> 4afc7a7 (Add missing UI components and fix TypeScript errors)
=======
import { computed } from "vue";
>>>>>>> 5c112eb (Fix code review issues and improve error handling)
import { TabsTrigger, type TabsTriggerProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<TabsTriggerProps & {
    class?: string;
}>();

const delegatedProps = computed(() => {
    const { class: _, ...delegated } = props;
    return delegated;
});
</script>

<template>
    <TabsTrigger
        v-bind="delegatedProps"
        :class="cn(
            'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
            props.class
        )"
    >
        <slot />
    </TabsTrigger>
</template>
