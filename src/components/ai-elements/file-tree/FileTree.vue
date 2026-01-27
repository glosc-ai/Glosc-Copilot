<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { FileTreeNode } from "./types";

import { cn } from "@/lib/utils";
import FileTreeItem from "./FileTreeItem.vue";

import { ElMessage, ElMessageBox } from "element-plus";

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

        /** 右键菜单：新建文件 */
        onCreateFile?: (dirPath: string, name: string) => void | Promise<void>;
        /** 右键菜单：新建文件夹 */
        onCreateFolder?: (
            dirPath: string,
            name: string,
        ) => void | Promise<void>;
        /** 右键菜单：在资源管理器中打开 */
        onRevealInExplorer?: (
            path: string,
            isDir: boolean,
        ) => void | Promise<void>;
        /** 右键菜单：删除 */
        onDelete?: (path: string, isDir: boolean) => void | Promise<void>;
        /** 右键菜单：重命名 */
        onRename?: (path: string, newName: string) => void | Promise<void>;

        /** 拖拽移动：srcPath -> destDirPath */
        onMove?: (srcPath: string, destDirPath: string) => void | Promise<void>;
        class?: HTMLAttributes["class"];
    }>(),
    {
        expanded: undefined,
        selectedPath: null,
        childrenByPath: undefined,
        loading: undefined,
        getNodeIcon: undefined,
        onSelect: undefined,
        onCreateFile: undefined,
        onCreateFolder: undefined,
        onRevealInExplorer: undefined,
        onDelete: undefined,
        onRename: undefined,
        onMove: undefined,
        class: undefined,
    },
);

type MenuAction = "new_file" | "new_folder" | "reveal" | "delete" | "rename";

const menuOpen = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuNode = ref<FileTreeNode | null>(null);

function closeMenu() {
    menuOpen.value = false;
    menuNode.value = null;
}

function getParentDir(path: string) {
    const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    if (idx <= 0) return "";
    return path.slice(0, idx);
}

function getTargetDirForCreate(node: FileTreeNode) {
    return node.isDir ? node.path : getParentDir(node.path);
}

function safeName(name: string) {
    const trimmed = (name || "").trim();
    if (!trimmed) return "";
    if (trimmed.includes("/") || trimmed.includes("\\")) return "";
    return trimmed;
}

function onNodeContextMenu(payload: { node: FileTreeNode; e: MouseEvent }) {
    payload.e.preventDefault();
    payload.e.stopPropagation();
    menuNode.value = payload.node;
    menuX.value = payload.e.clientX;
    menuY.value = payload.e.clientY;
    menuOpen.value = true;
}

async function runAction(action: MenuAction) {
    const node = menuNode.value;
    if (!node) return;

    try {
        if (action === "new_file") {
            const dirPath = getTargetDirForCreate(node);
            if (!props.onCreateFile) {
                ElMessage.warning("未配置新建文件处理逻辑");
                return;
            }
            const { value } = await ElMessageBox.prompt(
                "请输入文件名",
                "新建文件",
                {
                    confirmButtonText: "创建",
                    cancelButtonText: "取消",
                    inputPlaceholder: "例如：main.ts / README.md",
                    inputValidator: (v: string) => {
                        const s = safeName(v);
                        return s
                            ? true
                            : "文件名不能为空，且不能包含路径分隔符";
                    },
                },
            );
            const name = safeName(String(value));
            if (!name) return;
            await props.onCreateFile(dirPath, name);
            return;
        }

        if (action === "new_folder") {
            const dirPath = getTargetDirForCreate(node);
            if (!props.onCreateFolder) {
                ElMessage.warning("未配置新建文件夹处理逻辑");
                return;
            }
            const { value } = await ElMessageBox.prompt(
                "请输入文件夹名",
                "新建文件夹",
                {
                    confirmButtonText: "创建",
                    cancelButtonText: "取消",
                    inputPlaceholder: "例如：src / docs",
                    inputValidator: (v: string) => {
                        const s = safeName(v);
                        return s
                            ? true
                            : "文件夹名不能为空，且不能包含路径分隔符";
                    },
                },
            );
            const name = safeName(String(value));
            if (!name) return;
            await props.onCreateFolder(dirPath, name);
            return;
        }

        if (action === "reveal") {
            if (!props.onRevealInExplorer) {
                ElMessage.warning("未配置在资源管理器中打开的处理逻辑");
                return;
            }
            await props.onRevealInExplorer(node.path, node.isDir);
            return;
        }

        if (action === "rename") {
            if (!props.onRename) {
                ElMessage.warning("未配置重命名处理逻辑");
                return;
            }
            const { value } = await ElMessageBox.prompt(
                "请输入新名称",
                "重命名",
                {
                    confirmButtonText: "确定",
                    cancelButtonText: "取消",
                    inputValue: node.name,
                    inputValidator: (v: string) => {
                        const s = safeName(v);
                        return s ? true : "名称不能为空，且不能包含路径分隔符";
                    },
                },
            );
            const newName = safeName(String(value));
            if (!newName || newName === node.name) return;
            await props.onRename(node.path, newName);
            return;
        }

        if (action === "delete") {
            if (!props.onDelete) {
                ElMessage.warning("未配置删除处理逻辑");
                return;
            }
            await ElMessageBox.confirm(
                `确定要删除“${node.name}”吗？${node.isDir ? "（目录中的文件将被一并删除）" : ""}`,
                "删除确认",
                {
                    type: "warning",
                    confirmButtonText: "删除",
                    cancelButtonText: "取消",
                },
            );
            await props.onDelete(node.path, node.isDir);
            return;
        }
    } finally {
        closeMenu();
    }
}

function onGlobalPointerDown(e: MouseEvent) {
    if (!menuOpen.value) return;
    const target = e.target as HTMLElement | null;
    if (!target) {
        closeMenu();
        return;
    }
    if (target.closest?.("[data-filetree-menu]")) return;
    closeMenu();
}

watch(
    () => menuOpen.value,
    (open) => {
        if (open) {
            window.addEventListener("mousedown", onGlobalPointerDown, true);
            window.addEventListener(
                "contextmenu",
                onGlobalPointerDown as any,
                true,
            );
        } else {
            window.removeEventListener("mousedown", onGlobalPointerDown, true);
            window.removeEventListener(
                "contextmenu",
                onGlobalPointerDown as any,
                true,
            );
        }
    },
    { immediate: true },
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
            :on-context-menu="onNodeContextMenu"
            :on-move="onMove"
        />

        <!-- 右键菜单（固定定位） -->
        <Teleport to="body">
            <div
                v-if="menuOpen && menuNode"
                data-filetree-menu
                class="fixed z-[1000] min-w-44 rounded-md border bg-popover text-popover-foreground shadow-md p-1"
                :style="{ left: menuX + 'px', top: menuY + 'px' }"
                @contextmenu.prevent
            >
                <button
                    class="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent"
                    @click="runAction('new_file')"
                >
                    新建文件
                </button>
                <button
                    class="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent"
                    @click="runAction('new_folder')"
                >
                    新建文件夹
                </button>
                <div class="my-1 h-px bg-border" />
                <button
                    class="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent"
                    @click="runAction('reveal')"
                >
                    在资源管理器中打开
                </button>
                <div class="my-1 h-px bg-border" />
                <button
                    class="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent"
                    @click="runAction('rename')"
                >
                    重命名
                </button>
                <button
                    class="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-destructive/10 text-destructive"
                    @click="runAction('delete')"
                >
                    删除
                </button>
            </div>
        </Teleport>
    </div>
</template>
