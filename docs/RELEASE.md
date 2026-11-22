# Provider releases

Build the provider for macOS arm64 or Windows x64 with the native toolchain in the pinned [source inputs](../provider/0.8.3-ling.1/source-build-inputs.json). The [reproducibility runbook](../provider/0.8.3-ling.1/README.md) covers independent A/B runs and promotion.

The committed [provider lock](../provider/0.8.3-ling.1/provider-lock.json) authorizes the reviewed Darwin source build. Windows requires a reviewed promotion of its platform record. Both platforms require separately verified final platform signatures and runtime evidence for distribution.

The Provider native build workflow checks the locked inputs, runs two independent builds and compares their output. Run it on an environment that matches the pinned native toolchain. The downloadable workflow outputs are pre-sign candidates.

Build the release archive on the corresponding target after approving the source build and signing its native runtime. The signed revision directory contains the promoted lock, license, notices, platform executable and provider seal. Windows also includes the signed integrity catalog. The packaging command verifies the promoted lock, sealed digests and the platform signatures before archiving the selected files.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm package:release /path/to/signed/0.8.3-ling.1 /path/to/output 0.6.1
```

Pass the minimum Ling version supported by the reviewed runtime. On macOS, set `LING_CUA_DARWIN_EXPECTED_TEAM_ID` to the release Team ID. On Windows, use the SDK Developer shell with `signtool.exe` on PATH and set `LING_CUA_PROVIDER_SIGNER_SHA256` and `LING_CUA_CATALOG_SIGNER_SHA256` to the reviewed production certificate fingerprints.

Build both platform archives from the same source commit. Publish them and their SHA-256 sidecars under a new stable tag matching the plugin version after completing the platform release checks. Submit the tag, source commit and both archive digests to the [official Ling catalog](https://github.com/ling-stack-org/ling-stack/blob/main/docs/design/plugin-independent-packaging.md).
