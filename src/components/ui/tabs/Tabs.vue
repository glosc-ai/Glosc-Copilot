<script setup lang="ts">
<<<<<<< HEAD
import { computed } from "vue";
=======
>>>>>>> 4afc7a7 (Add missing UI components and fix TypeScript errors)
import { TabsRoot, type TabsRootProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<TabsRootProps & {
    class?: string;
}>();

const delegatedProps = computed(() => {
    const { class: _, ...delegated } = props;
    return delegated;
});
</script>

<template>
    <TabsRoot
        v-bind="delegatedProps"
        :class="cn('', props.class)"
    >
        <slot />
    </TabsRoot>
</template>
