import { loadEnv } from "vite";

export function loadBuildEnv(rootDir) {
    const envMode =
        process.env.GLOSC_ENV_MODE?.trim() ||
        process.env.NODE_ENV?.trim() ||
        "production";

    const loadedEnv = loadEnv(envMode, rootDir, "");

    for (const [key, value] of Object.entries(loadedEnv)) {
        if (typeof value !== "string") {
            continue;
        }

        // 显式导出的环境变量优先，.env 仅作为缺省值回填。
        if (!process.env[key]?.trim()) {
            process.env[key] = value;
        }
    }

    return {
        envMode,
        loadedEnv,
    };
}