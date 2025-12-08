import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "ant-design-vue/dist/reset.css";

// Suppress specific warning from ant-design-x-vue / ant-design-vue
const originalWarn = console.warn;
console.warn = (...args) => {
    if (
        typeof args[0] === "string" &&
        args[0].includes(
            "[ant-design-vue: Typography] When `ellipsis` is enabled, please use `content` instead of children"
        )
    ) {
        return;
    }
    originalWarn(...args);
};

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
