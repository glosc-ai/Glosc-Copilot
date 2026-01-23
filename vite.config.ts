import path from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import VueRouter from "unplugin-vue-router/vite";
import AutoImport from "unplugin-auto-import/vite";
import tailwindcss from "@tailwindcss/vite";
import components from "unplugin-vue-components/vite";
import Layouts from "vite-plugin-vue-layouts";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import type { ComponentResolver } from "unplugin-vue-components";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => {
    // lucide-vue-next 图标组件：支持 <Bot/> 以及 <RefreshCcwIcon/> 这种带 Icon 后缀的写法
    // - 如果 name 不是 lucide 的导出，则返回 undefined，避免覆盖本地同名组件
    // - 若以 Icon 结尾，则自动映射到去掉 Icon 后缀的导出（例如 CopyIcon -> Copy）
    // 说明：这里用动态 import 读取导出列表，保证 resolver 安全可靠。
    const lucide = (await import("lucide-vue-next")) as Record<string, unknown>;
    const lucideExportNames = new Set<string>(Object.keys(lucide));

    const lucideResolver: ComponentResolver = (name) => {
        const exportName = name.endsWith("Icon") ? name.slice(0, -4) : name;
        if (!lucideExportNames.has(exportName)) return;
        return { name: exportName, from: "lucide-vue-next" };
    };

    return {
        plugins: [
            vue(),
            VueRouter(),
            AutoImport({
                imports: ["vue", "vue-router", "pinia"],
                dirs: [
                    "./src/stores",
                    "./src/utils",
                    "./src/components/ai-elements/**",
                    "./src/components/ui/**",
                ],
                resolvers: [ElementPlusResolver()],
            }),
            tailwindcss(),
            components({
                resolvers: [ElementPlusResolver(), lucideResolver],
            }),
            Layouts(),
        ],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },

        // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
        //
        // 1. prevent Vite from obscuring rust errors
        clearScreen: false,
        // 2. tauri expects a fixed port, fail if that port is not available
        server: {
            port: 1421,
            strictPort: true,
            host: host || false,
            hmr: host
                ? {
                      protocol: "ws",
                      host,
                      port: 1422,
                  }
                : undefined,
            watch: {
                // 3. tell Vite to ignore watching `src-tauri`
                ignored: ["**/src-tauri/**"],
            },
        },
    };
});
