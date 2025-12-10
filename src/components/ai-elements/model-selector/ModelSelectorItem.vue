<script setup lang="ts">
import { CommandItem } from "@/components/ui/command";
import type { ListboxItemProps } from "reka-ui";
import { useForwardProps } from "reka-ui";

const props = defineProps<ListboxItemProps>();
const forwarded = useForwardProps(props);
</script>

<template>
    <CommandItem v-bind="forwarded">
        <slot />
    </CommandItem>
</template>
