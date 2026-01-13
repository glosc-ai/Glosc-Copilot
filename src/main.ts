import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";

import "element-plus/theme-chalk/dark/css-vars.css";
import "github-markdown-css/github-markdown.css";
import "./assets/css/main.less";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");

async function setupProdDevtoolsHotkey() {
    try {
        // When running in a normal browser (vite dev), Tauri internals are not available.
        if (!(window as any).__TAURI_INTERNALS__) return;

        const { invoke } = await import("@tauri-apps/api/core");
        const enabled = await invoke<boolean>("is_debug_enabled");
        if (!enabled) return;

        window.addEventListener(
            "keydown",
            (e) => {
                const isF12 = e.key === "F12";

                if (!isF12) return;

                e.preventDefault();
                invoke("open_devtools").catch(() => {
                    // ignore
                });
            },
            { capture: true }
        );
    } catch {
        // ignore
    }
}

setupProdDevtoolsHotkey();

// 配置 CORSFetch
(window as any).CORSFetch.config({
    include: [/^https?:\/\//i], // 处理所有 HTTP 请求（默认）
    exclude: ["https://www.glosc.ai", "http://localhost:3000"], // 跳过 CORS 绕过
});
