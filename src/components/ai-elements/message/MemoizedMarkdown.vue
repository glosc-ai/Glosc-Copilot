<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
import { cn } from "@/lib/utils";
import { useThrottleFn } from "@vueuse/core";

interface Props {
    id: string;
    content: string;
    isStreaming?: boolean;
    class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();

const throttledContent = ref("");
const applyThrottledContent = useThrottleFn(
    (next: string) => {
        throttledContent.value = next;
    },
    50,
    true,
    true
);

watch(
    () => [props.content, props.isStreaming] as const,
    ([content, isStreaming]) => {
        if (!isStreaming) {
            throttledContent.value = content;
            return;
        }
        applyThrottledContent(content);
    },
    { immediate: true }
);

const mdParser = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
});

function parseMarkdownIntoBlocks(markdown: string): string[] {
    if (!markdown) return [""];

    const lines = markdown.split("\n");

    try {
        const tokens = mdParser.parse(markdown, {});

        const ranges: Array<{ start: number; end: number }> = [];
        for (const token of tokens) {
            if (!token.map) continue;
            if (token.level !== 0) continue;

            const isBlockStart =
                token.nesting === 1 ||
                token.type === "fence" ||
                token.type === "code_block" ||
                token.type === "hr";

            if (!isBlockStart) continue;

            const [start, end] = token.map;
            if (typeof start !== "number" || typeof end !== "number") continue;
            if (end <= start) continue;

            const last = ranges[ranges.length - 1];
            if (last && last.start === start && last.end === end) continue;

            ranges.push({ start, end });
        }

        if (ranges.length === 0) return [markdown];

        const blocks: string[] = [];
        let cursor = 0;

        const appendGap = (gap: string) => {
            if (!gap) return;
            // 保留空行分隔，但避免单独渲染大量“空块”
            if (gap.trim() === "") {
                if (blocks.length === 0) return;
                blocks[blocks.length - 1] += "\n" + gap;
                return;
            }
            blocks.push(gap);
        };

        for (const range of ranges) {
            if (range.start > cursor) {
                appendGap(lines.slice(cursor, range.start).join("\n"));
            }

            blocks.push(lines.slice(range.start, range.end).join("\n"));
            cursor = range.end;
        }

        if (cursor < lines.length) {
            appendGap(lines.slice(cursor).join("\n"));
        }

        return blocks.filter((b) => b.length > 0);
    } catch {
        return [markdown];
    }
}

const effectiveContent = computed(() =>
    props.isStreaming ? throttledContent.value : props.content
);

const blocks = computed(() => parseMarkdownIntoBlocks(effectiveContent.value));
const blocksWithKeys = computed(() =>
    blocks.value.map((block, index) => ({
        block,
        key: `${props.id}-block_${index}`,
    }))
);

const htmlCache = new Map<string, string>();
function renderMarkdownToHtml(markdown: string): string {
    const cached = htmlCache.get(markdown);
    if (cached != null) return cached;

    const html = mdParser.render(markdown);
    htmlCache.set(markdown, html);
    return html;
}
</script>

<template>
    <div :class="cn('markdown-body', 'w-full', props.class)" v-bind="$attrs">
        <div
            v-for="item in blocksWithKeys"
            :key="item.key"
            v-memo="[item.block]"
            v-html="renderMarkdownToHtml(item.block)"
        />
    </div>
</template>
