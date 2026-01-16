<script setup lang="ts">
import type { PropType } from "vue";

import { ChevronDown, ChevronRight } from "lucide-vue-next";

type TreeNode = {
    name: string;
    path: string;
    isDir: boolean;
};

defineOptions({
    name: "WorkspaceTreeItem",
});

const props = defineProps({
    node: {
        type: Object as PropType<TreeNode>,
        required: true,
    },
    depth: {
        type: Number,
        required: true,
    },
    expandedDirs: {
        type: Object as PropType<Set<string>>,
        required: true,
    },
    childrenByPath: {
        type: Object as PropType<Record<string, TreeNode[]>>,
        required: true,
    },
    loadingDirs: {
        type: Object as PropType<Set<string>>,
        required: true,
    },
    activeFilePath: {
        type: String as PropType<string | null>,
        default: null,
    },
    getNodeIcon: {
        type: Function as PropType<(node: TreeNode) => any>,
        required: true,
    },
    onSelect: {
        type: Function as PropType<(node: TreeNode) => void | Promise<void>>,
        required: true,
    },
});

const isExpanded = computed(
    () => props.node.isDir && props.expandedDirs.has(props.node.path)
);
const isLoading = computed(
    () => props.node.isDir && props.loadingDirs.has(props.node.path)
);
const children = computed(() =>
    props.node.isDir ? props.childrenByPath[props.node.path] || [] : []
);

function handleClick() {
    void props.onSelect(props.node);
}
</script>

<template>
    <div>
        <div
            class="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-accent/40 cursor-pointer"
            :class="node.path === activeFilePath ? 'bg-accent/60' : ''"
            :style="{ paddingLeft: `${8 + depth * 14}px` }"
            @click="handleClick"
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
                :is="getNodeIcon(node)"
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

        <div v-if="node.isDir && isExpanded" class="space-y-1">
            <WorkspaceTreeItem
                v-for="child in children"
                :key="child.path"
                :node="child"
                :depth="depth + 1"
                :expanded-dirs="expandedDirs"
                :children-by-path="childrenByPath"
                :loading-dirs="loadingDirs"
                :active-file-path="activeFilePath"
                :get-node-icon="getNodeIcon"
                :on-select="onSelect"
            />
        </div>
    </div>
</template>
