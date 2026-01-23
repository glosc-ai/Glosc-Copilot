<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { FileTreeNode } from "./types";

import { cn } from "@/lib/utils";
import FileTreeItem from "./FileTreeItem.vue";

defineOptions({
    name: "AiFileTree",
});

const props = withDefaults(
    defineProps<{
        /** 根节点列表（通常是某个目录的 children） */
        nodes: FileTreeNode[];
        /** 受控：展开的目录 path 集合 */
        expanded?: Set<string>;
        /** 受控：当前选中的文件 path */
        selectedPath?: string | null;
        /** 懒加载：目录 path -> 子节点列表 */
        childrenByPath?: Record<string, FileTreeNode[]>;
        /** 懒加载：正在加载的目录集合 */
        loading?: Set<string>;
        /** 图标解析（优先于 node.icon） */
        getNodeIcon?: (node: FileTreeNode) => any;
        /** 点击（文件/目录）回调；目录展开逻辑可由外部处理 */
        onSelect?: (node: FileTreeNode) => void | Promise<void>;
        class?: HTMLAttributes["class"];
    }>(),
    {
        expanded: undefined,
        selectedPath: null,
        childrenByPath: undefined,
        loading: undefined,
        getNodeIcon: undefined,
        onSelect: undefined,
        class: undefined,
    },
);
</script>

<template>
    <div role="tree" :class="cn('space-y-1', props.class)">
        <FileTreeItem
            v-for="node in nodes"
            :key="node.path"
            :node="node"
            :depth="0"
            :expanded="expanded"
            :children-by-path="childrenByPath"
            :loading="loading"
            :selected-path="selectedPath"
            :get-node-icon="getNodeIcon"
            :on-select="onSelect"
        />
    </div>
</template>
