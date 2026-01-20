import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

async function readJson(filePath) {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
}

async function writeTextIfChanged(filePath, nextText) {
    const prevText = await fs.readFile(filePath, "utf8");
    if (prevText === nextText) return false;
    await fs.writeFile(filePath, nextText, "utf8");
    return true;
}

function replaceJsonVersionPreserveFormat(text, nextVersion) {
    const re = /(^\s*"version"\s*:\s*")([^"]+)("\s*,?\s*$)/m;
    if (!re.test(text)) {
        throw new Error('未在 tauri.conf.json 中找到顶层 "version" 字段');
    }
    return text.replace(re, `$1${nextVersion}$3`);
}

function replaceCargoPackageVersion(text, nextVersion) {
    // 仅替换 [package] 段内的 version = "..."，避免误伤依赖版本
    const packageStart = text.search(/^\[package\]\s*$/m);
    if (packageStart < 0) throw new Error("未找到 Cargo.toml 的 [package] 段");

    const afterPackage = text.slice(packageStart);
    const nextSectionIndex = afterPackage.slice(1).search(/^\[/m);
    const packageEnd =
        nextSectionIndex < 0
            ? text.length
            : packageStart + 1 + nextSectionIndex;

    const head = text.slice(0, packageStart);
    const pkg = text.slice(packageStart, packageEnd);
    const tail = text.slice(packageEnd);

    const re = /(^version\s*=\s*")([^"]+)("\s*$)/m;
    if (!re.test(pkg)) {
        throw new Error("未在 Cargo.toml 的 [package] 段中找到 version 字段");
    }

    const nextPkg = pkg.replace(re, `$1${nextVersion}$3`);
    return head + nextPkg + tail;
}

async function main() {
    const packageJsonPath = path.join(repoRoot, "package.json");
    const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
    const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");

    const pkg = await readJson(packageJsonPath);
    const nextVersion = pkg.version;
    if (!nextVersion || typeof nextVersion !== "string") {
        throw new Error("package.json 缺少合法的 version 字段");
    }

    const tauriText = await fs.readFile(tauriConfigPath, "utf8");
    const nextTauriText = replaceJsonVersionPreserveFormat(
        tauriText,
        nextVersion,
    );

    const cargoText = await fs.readFile(cargoTomlPath, "utf8");
    const nextCargoText = replaceCargoPackageVersion(cargoText, nextVersion);

    const changed = [];
    if (await writeTextIfChanged(tauriConfigPath, nextTauriText))
        changed.push("src-tauri/tauri.conf.json");
    if (await writeTextIfChanged(cargoTomlPath, nextCargoText))
        changed.push("src-tauri/Cargo.toml");

    if (changed.length) {
        console.log(
            `✅ 已同步版本号为 ${nextVersion}:\n- ${changed.join("\n- ")}`,
        );
    } else {
        console.log(`✅ 版本号已是最新：${nextVersion}`);
    }
}

await main();
