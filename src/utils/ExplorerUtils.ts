function dirnameLike(path: string) {
    const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return index > 0 ? path.slice(0, index) : "";
}

function detectPlatform() {
    const ua = navigator.userAgent || "";
    if (/Windows/i.test(ua)) return "windows";
    if (/Mac OS|Macintosh/i.test(ua)) return "macos";
    if (/Linux/i.test(ua)) return "linux";
    return "unknown";
}

export async function openInExplorer(
    path: string,
    options?: { isDir?: boolean },
) {
    if (!(window as any).__TAURI_INTERNALS__) {
        throw new Error("浏览器预览模式不支持打开资源管理器");
    }

    const isDir = options?.isDir ?? false;
    const platform = detectPlatform();
    const { Command } = await import("@tauri-apps/plugin-shell");

    try {
        if (platform === "windows") {
            if (isDir) {
                await Command.create("explorer.exe", [path]).spawn();
            } else {
                await Command.create("explorer.exe", [`/select,${path}`]).spawn();
            }
            return;
        }

        if (platform === "macos") {
            if (isDir) {
                await Command.create("open", [path]).spawn();
            } else {
                await Command.create("open", ["-R", path]).spawn();
            }
            return;
        }

        const folder = isDir ? path : dirnameLike(path);
        if (!folder) {
            throw new Error("无法解析要打开的目录路径");
        }
        await Command.create("xdg-open", [folder]).spawn();
    } catch (error) {
        const detail =
            error instanceof Error ? error.message : String(error || "");
        throw new Error(
            detail
                ? `打开资源管理器失败：${detail}`
                : "打开资源管理器失败：请检查 Tauri capabilities 是否允许 shell spawn（explorer.exe/open/xdg-open）",
        );
    }
}
