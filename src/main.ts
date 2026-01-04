import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";

// import "element-plus/dist/index.css";

import "element-plus/theme-chalk/dark/css-vars.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");

// 配置 CORSFetch
(window as any).CORSFetch.config({
    include: [/^https?:\/\//i], // 处理所有 HTTP 请求（默认）
    exclude: ["https://www.glosc.ai"], // 跳过 CORS 绕过
});
