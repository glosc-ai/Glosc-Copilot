import type { Component } from "vue";

export type FileTreeNode = {
    name: string;
    path: string;
    isDir: boolean;
    /** 可选：用于文件图标渲染 */
    icon?: Component;
};
