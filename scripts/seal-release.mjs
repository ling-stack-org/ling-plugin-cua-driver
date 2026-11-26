import { link, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { inspectSignedProviderSeal, releaseProviderLayout } from "./cua-driver-release-seal.mjs";

if (process.argv.length !== 3) throw new Error("Use seal:release <signed-provider-revision-directory>.");
const revision = await realpath(process.argv[2]);
const sealPath = join(revision, releaseProviderLayout().providerSealRelativePath);
const seal = await inspectSignedProviderSeal(revision);
const temporary = await mkdtemp(join(dirname(sealPath), ".provider-seal-"));
try {
  const file = join(temporary, "provider-seal.json");
  await writeFile(file, JSON.stringify(seal, null, 2) + "\n", { flag: "wx" });
  await link(file, sealPath);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(sealPath);
