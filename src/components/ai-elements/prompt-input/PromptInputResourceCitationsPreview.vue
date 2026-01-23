<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { usePromptInput } from "./context";
import { InlineCitationResourcesPreview } from "@/components/ai-elements/inline-citation";
import { removeMcpResourceCitation } from "@/utils/InlineCitationUtils";

const props = defineProps<{
    class?: HTMLAttributes["class"];
}>();

const { textInput, setTextInput } = usePromptInput();

const handleRemove = (n: number) => {
    setTextInput(removeMcpResourceCitation(String(textInput.value || ""), n));
};
</script>

<template>
    <InlineCitationResourcesPreview
        :text="String(textInput || '')"
        :class="cn('mt-2', props.class)"
        @remove="handleRemove"
    />
</template>
