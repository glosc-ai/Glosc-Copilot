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
        onContextMenu?: (payload: {
            node: FileTreeNode;
            e: MouseEvent;
        }) => void | Promise<void>;
        onMove?: (srcPath: string, destDirPath: string) => void | Promise<void>;
        class?: HTMLAttributes["class"];
    }>(),
    {
        expanded: undefined,
        childrenByPath: undefined,
        loading: undefined,
        selectedPath: null,
        getNodeIcon: undefined,
        onSelect: undefined,
        onContextMenu: undefined,
        onMove: undefined,
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

const dragOverCount = ref(0);
const isDragOver = computed(() => dragOverCount.value > 0);

function getDragPayload() {
    return {
        path: props.node.path,
        isDir: props.node.isDir,
        name: props.node.name,
    };
}

function onDragStart(e: DragEvent) {
    try {
        e.dataTransfer?.setData(
            "application/x-glosc-filetree",
            JSON.stringify(getDragPayload()),
        );
        e.dataTransfer?.setData("text/plain", props.node.path);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    } catch {
        // ignore
    }
}

function onDragEnter(e: DragEvent) {
    if (!props.node.isDir) return;
    e.preventDefault();
    dragOverCount.value += 1;
}

function onDragLeave() {
    if (!props.node.isDir) return;
    dragOverCount.value = Math.max(0, dragOverCount.value - 1);
}

function onDragOver(e: DragEvent) {
    if (!props.node.isDir) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
}

async function onDrop(e: DragEvent) {
    if (!props.node.isDir) return;
    e.preventDefault();
    dragOverCount.value = 0;

    if (!props.onMove) return;

    const raw = e.dataTransfer?.getData("application/x-glosc-filetree") || "";
    if (!raw) return;
    try {
        const data = JSON.parse(raw) as { path?: string };
        const srcPath = typeof data?.path === "string" ? data.path : "";
        if (!srcPath) return;
        if (srcPath === props.node.path) return;
        await props.onMove(srcPath, props.node.path);
    } catch {
        // ignore
    }
}

function triggerContextMenu(e: MouseEvent) {
    if (!props.onContextMenu) return;
    void props.onContextMenu({ node: props.node, e });
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
                    'flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm transition-colors cursor-pointer outline-none select-none',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus-visible:ring-1 focus-visible:ring-ring',
                    node.path === selectedPath
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground',
                    isDragOver ? 'ring-1 ring-primary bg-primary/10' : '',
                    props.class,
                )
            "
            :style="{ paddingLeft: `${8 + depth * 12}px` }"
            :draggable="true"
            @click="triggerSelect"
            @keydown="onKeydown"
            @contextmenu="triggerContextMenu"
            @dragstart="onDragStart"
            @dragenter="onDragEnter"
            @dragleave="onDragLeave"
            @dragover="onDragOver"
            @drop="onDrop"
        >
            <span
                class="w-4 h-4 inline-flex items-center justify-center shrink-0"
            >
                <template v-if="node.isDir">
                    <ChevronDown
                        v-if="isExpanded"
                        class="w-3.5 h-3.5 opacity-70"
                    />
                    <ChevronRight v-else class="w-3.5 h-3.5 opacity-70" />
                </template>
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
                :on-context-menu="onContextMenu"
                :on-move="onMove"
            />
        </div>
    </div>
</template>
