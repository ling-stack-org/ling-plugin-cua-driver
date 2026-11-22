# Provider releases

Build the provider for macOS arm64 or Windows x64 with the native toolchain in the pinned [source inputs](../provider/0.8.3-ling.1/source-build-inputs.json). The [reproducibility runbook](../provider/0.8.3-ling.1/README.md) covers independent A/B runs and promotion.

The committed [provider lock](../provider/0.8.3-ling.1/provider-lock.json) authorizes the recorded Darwin source build by its exact input and artifact digests. Changes to source inputs, including the managed MCP integration test, require fresh A/B evidence and review before promotion. Windows requires an initial promotion of its platform record. Both platforms require verified final platform signatures and installed runtime evidence for distribution.

The Provider native build workflow checks the locked inputs, runs two independent builds and compares their output. The macOS runner must expose the exact Xcode and SDK in the source inputs. The Windows job provisions Microsoft Build Tools 17.14.36, Visual Studio build `17.14.37502.11`. The Windows candidate pins the observed MSVC toolset directory `14.44.35207`, the selected compiler product version `14.44.35228.0`, and the SDK. The downloadable workflow outputs are pre-sign candidates.

A reviewed, signed runtime tree preserves the Ling resource layout under `runtime/providers/cua-driver/<distribution-revision>/`. Include the lock, license and notices, the native binary, the provider seal, and the Windows integrity catalog when applicable. Publish the platform archive with its provenance and submit its immutable release URL to the [official catalog](https://github.com/ling-stack-org/ling-stack/blob/main/docs/design/plugin-independent-packaging.md).
