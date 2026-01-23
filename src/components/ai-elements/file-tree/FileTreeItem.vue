<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { FileTreeNode } from "./types";

import { ChevronDown, ChevronRight } from "lucide-vue-next";
import { cn } from "@/lib/utils";

defineOptions({
    name: "AiFileTreeItem",
});

const props = withDefaults(
    defineProps<{
        node: FileTreeNode;
        depth: number;
        expanded?: Set<string>;
        childrenByPath?: Record<string, FileTreeNode[]>;
        loading?: Set<string>;
        selectedPath?: string | null;
        getNodeIcon?: (node: FileTreeNode) => any;
        onSelect?: (node: FileTreeNode) => void | Promise<void>;
        class?: HTMLAttributes["class"];
    }>(),
    {
        expanded: undefined,
        childrenByPath: undefined,
        loading: undefined,
        selectedPath: null,
        getNodeIcon: undefined,
        onSelect: undefined,
        class: undefined,
    },
);

const isExpanded = computed(
    () => props.node.isDir && Boolean(props.expanded?.has(props.node.path)),
);

const isLoading = computed(
    () => props.node.isDir && Boolean(props.loading?.has(props.node.path)),
);

const children = computed<FileTreeNode[]>(() => {
    if (!props.node.isDir) return [];
    return props.childrenByPath?.[props.node.path] || [];
});

function triggerSelect() {
    if (!props.onSelect) return;
    void props.onSelect(props.node);
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerSelect();
    }

    // 轻量键盘支持：右键展开/左键收起（由外部 onSelect/toggleDir 决定实际行为）
    if (props.node.isDir && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        triggerSelect();
    }
}
</script>

<template>
    <div>
        <div
            role="treeitem"
            :aria-expanded="node.isDir ? isExpanded : undefined"
            :aria-selected="node.path === selectedPath"
            tabindex="0"
            :class="
                cn(
                    'flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-accent/40 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    node.path === selectedPath ? 'bg-accent/60' : '',
                    props.class,
                )
            "
            :style="{ paddingLeft: `${8 + depth * 14}px` }"
            @click="triggerSelect"
            @keydown="onKeydown"
        >
            <span class="w-4 inline-flex justify-center">
                <template v-if="node.isDir">
                    <ChevronDown
                        v-if="isExpanded"
                        class="w-4 h-4 text-muted-foreground"
                    />
                    <ChevronRight
                        v-else
                        class="w-4 h-4 text-muted-foreground"
                    />
                </template>
                <span v-else class="w-4" />
            </span>

            <component
                :is="getNodeIcon ? getNodeIcon(node) : node.icon"
                v-if="getNodeIcon || node.icon"
                class="w-4 h-4 text-muted-foreground"
            />

            <span class="truncate">{{ node.name }}</span>

            <span
                v-if="isLoading"
                class="ml-auto text-xs text-muted-foreground"
            >
                读取中…
            </span>
        </div>

        <div v-if="node.isDir && isExpanded" role="group" class="space-y-1">
            <AiFileTreeItem
                v-for="child in children"
                :key="child.path"
                :node="child"
                :depth="depth + 1"
                :expanded="expanded"
                :children-by-path="childrenByPath"
                :loading="loading"
                :selected-path="selectedPath"
                :get-node-icon="getNodeIcon"
                :on-select="onSelect"
            />
        </div>
    </div>
</template>
