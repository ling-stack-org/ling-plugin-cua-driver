import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cuaDriverArtifactLayoutFor, cuaDriverArtifactPlatformForRuntime } from "./cua-driver-artifact-layout.mjs";
import { CUA_DRIVER_PACKAGE_REVISION } from "./cua-driver-package-staging-contract.mjs";
import { validateCuaDriverProviderLockContract } from "./cua-driver-provider-lock-contract.mjs";
import { verifyWindowsReleaseCatalog } from "./verify-windows-release-catalog.mjs";

const repo = resolve(import.meta.dirname, "..");
const { platform, arch } = process;
const [providerArgument, outputArgument, minLingVersion] = process.argv.slice(2);
if (!providerArgument || !outputArgument || !minLingVersion || process.argv.length !== 5) {
  throw new Error("Use package:release <signed-provider-revision-directory> <output-directory> <minimum-Ling-version>.");
}
if (!["darwin/arm64", "win32/x64"].includes(`${platform}/${arch}`)) {
  throw new Error("Build the release archive on its native target platform.");
}
const git = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
if (git(["status", "--porcelain", "--untracked-files=no"])) throw new Error("Release source must be clean.");
const sourceSha = git(["rev-parse", "HEAD"]);
const { version } = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("A stable plugin version is required.");
const runtime = await realpath(resolve(providerArgument));
const target = cuaDriverArtifactPlatformForRuntime(platform);
const layout = cuaDriverArtifactLayoutFor(target);
const lockPath = "provider-lock.json";
const windowsCatalogPath = "win32-x64/provider-integrity.cat";
const files = [lockPath, "LICENSE.md", "THIRD_PARTY_NOTICES.md", layout.packagedExecutableRelativePath,
  layout.providerSealRelativePath, ...(platform === "win32" ? [windowsCatalogPath] : [])];
const digests = new Map();
for (const file of files) {
  const path = join(runtime, file);
  const info = await lstat(path);
  if (!info.isFile() || await realpath(path) !== path || info.size < 1 || info.size > 128 * 1024 * 1024) {
    throw new Error(`Invalid signed provider member ${file}.`);
  }
  digests.set(file, digest(await readFile(path)));
}
const lockBytes = await readFile(join(runtime, lockPath));
const reviewedLock = await readFile(join(repo, "provider", CUA_DRIVER_PACKAGE_REVISION, lockPath));
if (!lockBytes.equals(reviewedLock)) throw new Error("Provider lock must match the promoted repository lock.");
const lock = validateCuaDriverProviderLockContract(JSON.parse(lockBytes.toString("utf8")), {
  platform, architecture: layout.architecture, requireReleaseEvidence: true,
});
const seal = JSON.parse(await readFile(join(runtime, layout.providerSealRelativePath), "utf8"));
const executable = join(runtime, layout.packagedExecutableRelativePath);
if (seal.platform !== platform || seal.signingTier !== "production_signed" || seal.distributionChannel !== "production"
  || seal.productionEligible !== true || seal.lockSha256 !== digests.get(lockPath)
  || (platform === "win32" ? seal.main?.sha256 : seal.executableSha256) !== digests.get(layout.packagedExecutableRelativePath)
  || lock.upstream.licenseSha256 !== digests.get("LICENSE.md")) {
  throw new Error("The production provider lock, seal and native payload do not agree.");
}

if (platform === "darwin") {
  const team = process.env.LING_CUA_DARWIN_EXPECTED_TEAM_ID;
  if (!/^[A-Z0-9]{10}$/u.test(team ?? "") || seal.teamId !== team) {
    throw new Error("The macOS provider must match the release Team ID.");
  }
  execFileSync("/usr/bin/codesign", ["--verify", "--strict", "--all-architectures",
    `-R=anchor apple generic and certificate leaf[subject.OU] = "${team}" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists`,
    executable], { stdio: "inherit", timeout: 30_000 });
} else {
  const catalog = join(runtime, windowsCatalogPath);
  verifyAuthenticode(executable, process.env.LING_CUA_PROVIDER_SIGNER_SHA256);
  verifyAuthenticode(catalog, process.env.LING_CUA_CATALOG_SIGNER_SHA256);
  execFileSync("signtool.exe", ["verify", "/pa", "/c", catalog, executable], { stdio: "inherit", timeout: 30_000 });
}

const stage = await mkdtemp(join(tmpdir(), "ling-cua-driver-release-"));
try {
  const destination = join(stage, "runtime", "providers", "cua-driver", CUA_DRIVER_PACKAGE_REVISION);
  for (const file of [".ling-plugin/plugin.json", "mcp-server.json"]) {
    const path = join(stage, file);
    await mkdir(dirname(path), { recursive: true });
    await copyFile(join(repo, file), path);
  }
  for (const file of files) {
    const path = join(destination, file);
    await mkdir(dirname(path), { recursive: true });
    await copyFile(join(runtime, file), path);
    if (digest(await readFile(path)) !== digests.get(file)) throw new Error(`Provider member changed during staging: ${file}`);
  }
  if (platform === "win32") {
    const payload = dirname(join(destination, layout.packagedExecutableRelativePath));
    verifyWindowsReleaseCatalog(join(destination, windowsCatalogPath), payload);
  }
  execFileSync(process.execPath, [
    join(repo, "scripts", "package-plugin.mjs"), "--root", stage, "--output", resolve(outputArgument),
    "--version", version, "--platform", platform, "--arch", arch, "--channel", "stable",
    "--repository", "ling-stack-org/ling-plugin-cua-driver", "--releaseTag", `v${version}`,
    "--sourceSha", sourceSha, "--minLingVersion", minLingVersion,
  ], { stdio: "inherit" });
} finally {
  await rm(stage, { recursive: true, force: true });
}

function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function verifyAuthenticode(path, certificateSha256) {
  if (!/^[a-f0-9]{64}$/u.test(certificateSha256 ?? "")) {
    throw new Error("A reviewed SHA-256 signing certificate fingerprint is required.");
  }
  const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", [
    "$ErrorActionPreference = 'Stop'",
    "$signature = Get-AuthenticodeSignature -LiteralPath $env:LING_CUA_RELEASE_VERIFY_PATH",
    "if ($signature.Status -ne 'Valid' -or !$signature.SignerCertificate -or !$signature.TimeStamperCertificate) { exit 1 }",
    "$digest = [System.Security.Cryptography.SHA256]::Create().ComputeHash($signature.SignerCertificate.RawData)",
    "[BitConverter]::ToString($digest).Replace('-', '').ToLowerInvariant()",
  ].join("\n")], { env: { ...process.env, LING_CUA_RELEASE_VERIFY_PATH: path },
    encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024 }).trim();
  if (result !== certificateSha256) throw new Error("The production signature identity does not match the reviewed certificate.");
}
