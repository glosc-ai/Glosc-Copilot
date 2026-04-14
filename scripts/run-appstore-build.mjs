import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuildEnv } from "./load-build-env.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);
const repoRoot = resolve(currentDir, "..");

loadBuildEnv(repoRoot);

const mode = process.argv[2];
const appleTarget =
    process.env.TAURI_APPLE_TARGET?.trim() || "universal-apple-darwin";
const hasSigningIdentity = Boolean(
    process.env.APPLE_SIGNING_IDENTITY?.trim(),
);
const hasCertificate = Boolean(process.env.APPLE_CERTIFICATE?.trim());

if (mode !== "build" && mode !== "bundle") {
    console.error("用法: node scripts/run-appstore-build.mjs <build|bundle>");
    process.exit(1);
}

if (!hasSigningIdentity && !hasCertificate) {
    console.error(
        "App Store 构建缺少签名配置：请设置 APPLE_SIGNING_IDENTITY 或 APPLE_CERTIFICATE。",
    );
    process.exit(1);
}

const env = {
    ...process.env,
    GLOSC_APP_STORE: "1",
    VITE_APP_STORE_BUILD: "true",
};

const prepareResult = spawnSync("yarn", ["-s", "prepare:binaries"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
});

if (prepareResult.status !== 0) {
    process.exit(prepareResult.status ?? 1);
}

const tauriResult = spawnSync(
    "yarn",
    [
        "-s",
        "tauri",
        mode,
        "--bundles",
        "app",
        "--target",
        appleTarget,
        "--config",
        "src-tauri/tauri.appstore.conf.json",
    ],
    {
        cwd: repoRoot,
        env,
        stdio: "inherit",
    },
);

if (tauriResult.status !== 0) {
    process.exit(tauriResult.status ?? 1);
}

if (!process.env.APPLE_INSTALLER_SIGNING_IDENTITY?.trim()) {
    console.warn(
        "提示：当前未设置 APPLE_INSTALLER_SIGNING_IDENTITY，后续执行 yarn appstore:pkg 时仍需补充安装包签名证书。",
    );
}