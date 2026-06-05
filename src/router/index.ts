import { createMemoryHistory, createRouter } from "vue-router";
// import { routes } from "vue-router/auto-routes";
import { setupLayouts } from "virtual:generated-layouts";

import { routes } from "vue-router/auto-routes";

const enabledRoutes = (routes as any[]).filter((route) => {
    const path = String(route?.path || "");
    return path !== "/workspace" && path !== "/meeting" && !path.startsWith("/meeting/");
});

const router = createRouter({
    history: createMemoryHistory(),
    routes: setupLayouts(enabledRoutes as any),
});
export default router;
