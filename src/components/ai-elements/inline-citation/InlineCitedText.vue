<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { cn } from "@/lib/utils";

import {
    InlineCitation,
    InlineCitationCard,
    InlineCitationCardBody,
    InlineCitationCardTrigger,
    InlineCitationQuote,
    InlineCitationSource,
} from ".";

import { parseTextWithInlineCitations } from "@/utils/InlineCitationUtils";

const props = defineProps<{
    content: string;
    class?: HTMLAttributes["class"];
    triggerLabel?: string;
}>();

const parts = computed(() => parseTextWithInlineCitations(props.content));
</script>

<template>
    <span :class="cn('whitespace-pre-wrap break-words', props.class)">
        <template v-for="part in parts" :key="part.key">
            <span v-if="part.type === 'text'">{{ part.content }}</span>

            <InlineCitation v-else>
                <InlineCitationCard>
                    <InlineCitationCardTrigger
                        :sources="[part.citation.url]"
                        :label="props.triggerLabel"
                    />
                    <InlineCitationCardBody>
                        <InlineCitationSource
                            :title="part.citation.title"
                            :url="part.citation.url"
                            :description="part.citation.description"
                        />
                        <InlineCitationQuote v-if="part.citation.quote">
                            {{ part.citation.quote }}
                        </InlineCitationQuote>
                    </InlineCitationCardBody>
                </InlineCitationCard>
            </InlineCitation>
        </template>
    </span>
</template>
