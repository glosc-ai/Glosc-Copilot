import { createMemoryHistory, createRouter } from "vue-router";
// import { routes } from "vue-router/auto-routes";
import { setupLayouts } from "virtual:generated-layouts";

import { routes } from "vue-router/auto-routes";

const router = createRouter({
    history: createMemoryHistory(),
    routes: setupLayouts(routes as any),
});
export default router;
