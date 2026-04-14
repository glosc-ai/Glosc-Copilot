import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuildEnv } from "./load-build-env.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);
const repoRoot = resolve(currentDir, "..");

loadBuildEnv(repoRoot);

const tauriConfigPath = resolve(repoRoot, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));

const productName = String(tauriConfig.productName || "").trim();
const installerSigningIdentity =
    process.env.APPLE_INSTALLER_SIGNING_IDENTITY?.trim() || "";
const appleTarget =
    process.env.TAURI_APPLE_TARGET?.trim() || "universal-apple-darwin";

if (!productName) {
    console.error("无法从 src-tauri/tauri.conf.json 读取 productName");
    process.exit(1);
}

if (!installerSigningIdentity) {
    console.error("缺少 APPLE_INSTALLER_SIGNING_IDENTITY，无法签名 App Store PKG");
    process.exit(1);
}

const appBundlePath = resolve(
    repoRoot,
    "src-tauri",
    "target",
    appleTarget,
    "release",
    "bundle",
    "macos",
    `${productName}.app`,
);

if (!existsSync(appBundlePath)) {
    console.error(`未找到应用包：${appBundlePath}`);
    console.error("请先执行 yarn tauri:build:appstore 生成 .app 产物");
    process.exit(1);
}

const outputDir = resolve(
    repoRoot,
    "src-tauri",
    "target",
    appleTarget,
    "release",
    "bundle",
    "app-store",
);
const pkgPath = resolve(outputDir, `${productName}.pkg`);

mkdirSync(outputDir, { recursive: true });

if (existsSync(pkgPath)) {
    rmSync(pkgPath);
}

const productBuildResult = spawnSync(
    "xcrun",
    [
        "productbuild",
        "--sign",
        installerSigningIdentity,
        "--component",
        appBundlePath,
        "/Applications",
        pkgPath,
    ],
    { stdio: "inherit" },
);

if (productBuildResult.status !== 0) {
    process.exit(productBuildResult.status ?? 1);
}

console.log(`已生成 App Store PKG：${pkgPath}`);