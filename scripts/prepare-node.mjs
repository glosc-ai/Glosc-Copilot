import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import * as tar from "tar";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Node.js 版本，可根据需要调整
const NODE_VERSION = "20.18.1"; // 使用 LTS 版本

function getNodeTriple() {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "win32") {
        if (arch === "x64") return "win-x64";
        if (arch === "arm64") return "win-arm64";
        if (arch === "ia32") return "win-x86";
    }

    if (platform === "darwin") {
        if (arch === "arm64") return "darwin-arm64";
        if (arch === "x64") return "darwin-x64";
    }

    if (platform === "linux") {
        if (arch === "x64") return "linux-x64";
        if (arch === "arm64") return "linux-arm64";
    }

    throw new Error(`Unsupported platform/arch for node: ${platform}/${arch}`);
}

function getTauriTriple() {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "win32") {
        if (arch === "x64") return "x86_64-pc-windows-msvc";
        if (arch === "arm64") return "aarch64-pc-windows-msvc";
        if (arch === "ia32") return "i686-pc-windows-msvc";
    }

    if (platform === "darwin") {
        if (arch === "arm64") return "aarch64-apple-darwin";
        if (arch === "x64") return "x86_64-apple-darwin";
    }

    if (platform === "linux") {
        if (arch === "x64") return "x86_64-unknown-linux-gnu";
        if (arch === "arm64") return "aarch64-unknown-linux-gnu";
    }

    throw new Error(`Unsupported platform/arch:  ${platform}/${arch}`);
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function downloadToFile(url, destFile) {
    const res = await fetch(url, {
        redirect: "follow",
        headers: {
            "User-Agent": "glosc-copilot-build",
        },
    });
    if (!res.ok) {
        throw new Error(
            `Failed to download ${url}: ${res.status} ${res.statusText}`,
        );
    }

    const arrayBuffer = await res.arrayBuffer();
    await fs.writeFile(destFile, new Uint8Array(arrayBuffer));
}

async function findFileRecursive(rootDir, predicate) {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            const found = await findFileRecursive(fullPath, predicate);
            if (found) return found;
        } else if (entry.isFile()) {
            if (await predicate(fullPath, entry.name)) return fullPath;
        }
    }
    return null;
}

async function main() {
    const nodeTriple = getNodeTriple();
    const tauriTriple = getTauriTriple();
    const binariesDir = path.resolve(__dirname, "..", "src-tauri", "binaries");

    const outFile = path.join(
        binariesDir,
        process.platform === "win32"
            ? `node-${tauriTriple}.exe`
            : `node-${tauriTriple}`,
    );

    if (await fileExists(outFile)) {
        console.log(
            `[prepare-node] Found: ${path.relative(process.cwd(), outFile)}`,
        );
        return;
    }

    await fs.mkdir(binariesDir, { recursive: true });

    const artifact =
        process.platform === "win32"
            ? `node-v${NODE_VERSION}-${nodeTriple}. zip`
            : `node-v${NODE_VERSION}-${nodeTriple}.tar.gz`;

    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${artifact}`;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "glosc-node-"));
    const archivePath = path.join(tmpDir, artifact);

    console.log(`[prepare-node] Downloading ${artifact} ... `);
    await downloadToFile(url, archivePath);

    if (process.platform === "win32") {
        const zip = new AdmZip(archivePath);
        const entries = zip.getEntries();

        const nodeEntry = entries.find((e) => {
            const name = e.entryName.replaceAll("\\", "/");
            return name.endsWith("/node.exe") || name === "node.exe";
        });

        if (!nodeEntry) {
            throw new Error(`node.exe not found in ${artifact}`);
        }

        const data = nodeEntry.getData();
        await fs.writeFile(outFile, data);
    } else {
        console.log(`[prepare-node] Extracting ${artifact} ...`);
        const extractDir = path.join(tmpDir, "extract");
        await fs.mkdir(extractDir, { recursive: true });
        await tar.x({ file: archivePath, cwd: extractDir });

        const nodePath = await findFileRecursive(
            extractDir,
            async (fullPath, name) => {
                // Node tarballs contain node binary in bin/node
                return name === "node" && fullPath.includes("/bin/");
            },
        );

        if (!nodePath) {
            throw new Error(
                `node binary not found in ${artifact} after extraction. `,
            );
        }

        await fs.copyFile(nodePath, outFile);
        await fs.chmod(outFile, 0o755);
    }

    console.log(
        `[prepare-node] Installed:  ${path.relative(process.cwd(), outFile)}`,
    );
}

main().catch((err) => {
    console.error(String(err?.stack || err));
    process.exit(1);
});
