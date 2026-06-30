import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_DIR = dirname(fileURLToPath(import.meta.url));
const PROFILE = process.env.PROFILE || "debug";
const profileDir = PROFILE === "release" ? "release" : "debug";

function getTarget() {
  if (process.env.TARGET) return process.env.TARGET;
  if (process.env.TAURI_ENV_TARGET_TRIPLE) return process.env.TAURI_ENV_TARGET_TRIPLE;
  try {
    const output = execSync("rustc -vV", { encoding: "utf-8" });
    const match = output.match(/host:\s*(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return "unknown";
}

const TARGET = getTarget();
const isWindows = TARGET.includes("windows");
const releaseBuild = PROFILE === "release";

function getSourceCandidates(binName) {
  const candidates = [];

  // Cargo writes to target/<triple>/<profile> whenever --target is passed,
  // even when the target triple equals the host triple. GitHub release builds
  // pass --target x86_64-pc-windows-msvc, so this path must be checked first.
  if (TARGET !== "unknown") {
    candidates.push(join(MANIFEST_DIR, "target", TARGET, profileDir, binName));
  }

  // Native builds without an explicit --target write to target/<profile>.
  candidates.push(join(MANIFEST_DIR, "target", profileDir, binName));

  return [...new Set(candidates)];
}

const destDir = join(MANIFEST_DIR, "binaries");
mkdirSync(destDir, { recursive: true });

function copyBinary(baseName) {
  const binName = isWindows ? `${baseName}.exe` : baseName;
  const sourceCandidates = getSourceCandidates(binName);
  const source = sourceCandidates.find((candidate) => existsSync(candidate));

  let destName = `${baseName}-${TARGET}`;
  if (isWindows) destName += ".exe";
  const dest = join(destDir, destName);

  if (source) {
    const size = statSync(source).size;
    if (releaseBuild && size === 0) {
      console.error(`Error: Release sidecar is empty: ${source}`);
      process.exit(1);
    }

    copyFileSync(source, dest);
    console.log(`Copied ${binName} to ${dest}`);
  } else {
    if (existsSync(dest)) {
      rmSync(dest, { force: true });
    }

    console.log(
      `Warning: Binary not found. Checked:\n${sourceCandidates
        .map((candidate) => `  - ${candidate}`)
        .join("\n")}`,
    );

    if (releaseBuild) {
      console.error("Error: Release build requires a real donut-proxy sidecar.");
      process.exit(1);
    }

    writeFileSync(dest, "");
    console.log(`Created empty placeholder at ${dest}`);
  }
}

copyBinary("donut-proxy");
