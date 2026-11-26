import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { CUA_DRIVER_PACKAGE_REVISION } from "./cua-driver-package-staging-contract.mjs";
import { readBoundedFileSnapshot } from "./cua-driver-package-staging-files.mjs";
import { inspectSignedProviderSeal, releaseProviderLayout, verifyReleaseAuthenticode } from "./cua-driver-release-seal.mjs";
import { verifyWindowsReleaseCatalog } from "./verify-windows-release-catalog.mjs";

const repo = resolve(import.meta.dirname, "..");
const { platform, arch } = process;
const [providerArgument, outputArgument, minLingVersion] = process.argv.slice(2);
if (!providerArgument || !outputArgument || !minLingVersion || process.argv.length !== 5) {
  throw new Error("Use package:release <signed-provider-revision-directory> <output-directory> <minimum-Ling-version>.");
}
const layout = releaseProviderLayout();
const git = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
if (git(["status", "--porcelain", "--untracked-files=no"])) throw new Error("Release source must be clean.");
const sourceSha = git(["rev-parse", "HEAD"]);
const { version } = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("A stable plugin version is required.");
const runtime = await realpath(resolve(providerArgument));
const lockPath = "provider-lock.json";
const windowsCatalogPath = "win32-x64/provider-integrity.cat";
const files = [lockPath, "LICENSE.md", "THIRD_PARTY_NOTICES.md", layout.packagedExecutableRelativePath,
  layout.providerSealRelativePath, ...(platform === "win32" ? [windowsCatalogPath] : [])];
const stage = await mkdtemp(join(tmpdir(), "ling-cua-driver-release-"));
try {
  const destination = join(stage, "runtime", "providers", "cua-driver", CUA_DRIVER_PACKAGE_REVISION);
  for (const file of [".ling-plugin/plugin.json", "mcp-server.json"]) {
    const path = join(stage, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, await readFile(join(repo, file)), { flag: "wx" });
  }
  for (const file of files) {
    const source = join(runtime, file);
    if (await realpath(source) !== source || !(await lstat(source)).isFile()) {
      throw new Error(`Invalid signed provider member ${file}.`);
    }
    const snapshot = await readBoundedFileSnapshot(source, 128 * 1024 * 1024, "release_member");
    const path = join(destination, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, snapshot.bytes, { flag: "wx", mode: snapshot.mode & 0o777 });
  }
  const executable = join(destination, layout.packagedExecutableRelativePath);
  const seal = JSON.parse(await readFile(join(destination, layout.providerSealRelativePath), "utf8"));
  const observedSeal = await inspectSignedProviderSeal(destination);
  if (!isDeepStrictEqual(seal, observedSeal)) {
    throw new Error("The provider seal differs from the staged executable and promoted lock.");
  }
  if (platform === "win32") {
    const catalog = join(destination, windowsCatalogPath);
    verifyReleaseAuthenticode(catalog, process.env.LING_CUA_CATALOG_SIGNER_SHA256);
    execFileSync("signtool.exe", ["verify", "/pa", "/c", catalog, executable], { stdio: "inherit", timeout: 30_000 });
    verifyWindowsReleaseCatalog(catalog, dirname(executable));
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
