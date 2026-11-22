# Ling Cua Driver Plugin

This repository owns Ling's reviewed Cua Driver provider source-build inputs, patch series, reproducibility evidence and platform artifacts. Ling Desktop remains the authority for process lifetime, interactive-session checks, leases, approvals and audit.

The provider is never accepted from an arbitrary URL or an unsigned binary. Each release binds the upstream commit, patch set, toolchain, provider lock, platform artifact digest, license and third-party notices. The existing A/B build and promotion gates remain required.

The package workflow is intentionally blocked until the committed provider lock enables the target platform and the required native signing evidence is present.

See the documents under [docs](docs/) for the embedded-provider contract and guided installation flow.
