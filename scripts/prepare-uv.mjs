import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import * as tar from "tar";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getUvTriple() {
    const platform = process.platform;
    const arch = process.arch;

    // This matches Astral uv release artifacts.
    // See: https://github.com/astral-sh/uv/releases/latest
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

    throw new Error(`Unsupported platform/arch for uv: ${platform}/${arch}`);
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
            // Avoid some GitHub edge cases
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
    const binariesDir = path.resolve(__dirname, "..", "src-tauri", "binaries");

    // On macOS, download both x64 and arm64 versions for cross-compilation
    const triples =
        process.platform === "darwin"
            ? [
                  {
                      uvTriple: "x86_64-apple-darwin",
                      tauriTriple: "x86_64-apple-darwin",
                  },
                  {
                      uvTriple: "aarch64-apple-darwin",
                      tauriTriple: "aarch64-apple-darwin",
                  },
              ]
            : [{ uvTriple: getUvTriple(), tauriTriple: getUvTriple() }];

    for (const { uvTriple, tauriTriple } of triples) {
        const outFile = path.join(
            binariesDir,
            process.platform === "win32"
                ? `uv-${tauriTriple}.exe`
                : `uv-${tauriTriple}`,
        );

        if (await fileExists(outFile)) {
            console.log(
                `[prepare-uv] Found: ${path.relative(process.cwd(), outFile)}`,
            );
            continue;
        }

        await fs.mkdir(binariesDir, { recursive: true });

        const artifact =
            process.platform === "win32"
                ? `uv-${uvTriple}.zip`
                : `uv-${uvTriple}.tar.gz`;

        const url = `https://github.com/astral-sh/uv/releases/latest/download/${artifact}`;
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "glosc-uv-"));
        const archivePath = path.join(tmpDir, artifact);

        console.log(`[prepare-uv] Downloading ${artifact} ...`);
        await downloadToFile(url, archivePath);

        if (process.platform === "win32") {
            const zip = new AdmZip(archivePath);
            const entries = zip.getEntries();

            // Usually contains uv.exe in the root.
            const uvEntry = entries.find((e) => {
                const name = e.entryName.replaceAll("\\", "/");
                return name.endsWith("/uv.exe") || name === "uv.exe";
            });

            if (!uvEntry) {
                const names = entries
                    .slice(0, 50)
                    .map((e) => e.entryName)
                    .join("\n");
                throw new Error(
                    `uv.exe not found in ${artifact}. Entries (first 50):\n${names}`,
                );
            }

            const data = uvEntry.getData();
            await fs.writeFile(outFile, data);
        } else {
            console.log(`[prepare-uv] Extracting ${artifact} ...`);
            const extractDir = path.join(tmpDir, "extract");
            await fs.mkdir(extractDir, { recursive: true });
            await tar.x({ file: archivePath, cwd: extractDir });

            const uvPath = await findFileRecursive(
                extractDir,
                async (fullPath, name) => {
                    // Tarballs typically contain a single 'uv' file at root.
                    // Be tolerant of a folder prefix.
                    return name === "uv";
                },
            );

            if (!uvPath) {
                throw new Error(
                    `uv not found in ${artifact} after extraction.`,
                );
            }

            await fs.copyFile(uvPath, outFile);
            await fs.chmod(outFile, 0o755);
        }

        console.log(
            `[prepare-uv] Installed: ${path.relative(process.cwd(), outFile)}`,
        );
    }
}

main().catch((err) => {
    console.error(String(err?.stack || err));
    process.exit(1);
});
