<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { X } from "lucide-vue-next";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { HoverCardTrigger } from "@/components/ui/hover-card";

import {
    InlineCitation,
    InlineCitationCard,
    InlineCitationCardBody,
    InlineCitationQuote,
    InlineCitationSource,
} from ".";

import {
    extractMcpResourceCitations,
    hasMcpResourceBlocks,
} from "@/utils/InlineCitationUtils";

const props = defineProps<{
    text: string;
    class?: HTMLAttributes["class"];
    emptyText?: string;
}>();

const emits = defineEmits<{
    (e: "remove", number: number): void;
}>();

const extracted = computed(() => extractMcpResourceCitations(props.text));
const visible = computed(() => hasMcpResourceBlocks(props.text));

const handleRemove = (n: number) => emits("remove", n);
</script>

<template>
    <div
        v-if="visible"
        :class="cn('flex flex-wrap items-center gap-1 text-xs', props.class)"
    >
        <template v-if="extracted.citations.length === 0">
            <span class="text-muted-foreground">{{
                props.emptyText || "无"
            }}</span>
        </template>
        <template v-else>
            <InlineCitation
                v-for="c in extracted.citations"
                :key="String(c.number)"
            >
                <InlineCitationCard>
                    <HoverCardTrigger as-child>
                        <Badge
                            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                            variant="secondary"
                        >
                            <span class="truncate max-w-40">{{
                                `${c.number}. ${c.title}`
                            }}</span>
                            <button
                                type="button"
                                class="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted/60"
                                :title="`移除引用：${c.number}`"
                                aria-label="移除引用"
                                @click.stop="handleRemove(c.number)"
                            >
                                <X class="h-3 w-3" />
                            </button>
                        </Badge>
                    </HoverCardTrigger>

                    <InlineCitationCardBody>
                        <InlineCitationSource
                            :title="`${c.number}. ${c.title}`"
                            :url="c.url"
                            :description="c.description"
                        />
                        <InlineCitationQuote v-if="c.quote">
                            {{ c.quote }}
                        </InlineCitationQuote>
                    </InlineCitationCardBody>
                </InlineCitationCard>
            </InlineCitation>
        </template>
    </div>
</template>
