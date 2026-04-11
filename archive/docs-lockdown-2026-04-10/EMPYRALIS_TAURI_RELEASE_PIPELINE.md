# Empyralis Tauri Release Pipeline

This repository now ships the desktop app through a signed GitHub Actions release pipeline for macOS and Windows.

The canonical workflow is:
- tag a release as `vX.Y.Z`
- GitHub Actions builds the frontend and bundled Python backend
- GitHub Actions generates a CI-only Tauri release config with updater metadata
- macOS artifacts are code signed and notarized
- Windows installer artifacts are Authenticode signed
- release bundles are attested in GitHub Actions provenance
- installers plus updater metadata are attached to the GitHub Release

## Release artifacts

Expected release assets:
- macOS
  - `.dmg`
  - `.app.tar.gz`
  - `.app.tar.gz.sig`
- Windows
  - `.msi`
  - `.msi.sig`
  - `.exe`
  - `.exe.sig`
- updater metadata
  - `latest.json`

`latest.json` is produced by the Tauri updater pipeline and is what signed desktop builds use for update checks.

## Required GitHub secrets

Updater signing:
- `TAURI_UPDATER_PUBLIC_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

macOS signing and notarization:
- `APPLE_CERTIFICATE`
  - base64-encoded `.p12` signing certificate
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
  - for example `Developer ID Application: Example Corp (TEAMID)`
- `KEYCHAIN_PASSWORD`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY_P8`
  - base64-encoded App Store Connect API key `.p8`

Windows code signing:
- `WINDOWS_CERTIFICATE`
  - base64-encoded `.pfx`
- `WINDOWS_CERTIFICATE_PASSWORD`

Optional GitHub repository variable:
- `WINDOWS_TIMESTAMP_URL`
  - defaults to `http://timestamp.comodoca.com` when unset

## Generating the updater key pair

Use the Tauri signer CLI once and store the outputs in your secret manager:

```bash
npx tauri signer generate -w ~/.tauri/empyralis-updater.key
```

Store:
- the public key output as `TAURI_UPDATER_PUBLIC_KEY`
- the private key file contents as `TAURI_SIGNING_PRIVATE_KEY`
- the private key password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## Release flow

1. Update the desktop version in:
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Commit the version bump.
3. Create and push a tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

4. Wait for `.github/workflows/build.yml` to finish.
5. Download the signed installers from the GitHub Release page.
6. Use the GitHub attestation view for the release run if supply-chain provenance needs to be inspected.

## Local development

Local unsigned development builds are intentionally unchanged:
- `cargo build` still works without signing secrets
- release-only updater/signing settings are generated in CI via `scripts/write_tauri_release_config.py`
- local dev builds continue using `src-tauri/tauri.conf.json`

## CI-only release config

The workflow writes `src-tauri/tauri.release.conf.json` during CI.

That generated file adds:
- updater endpoints
- updater public key
- updater artifact generation
- Windows signing metadata when a Windows certificate is present
- macOS signing identity when provided

This keeps the committed base config safe for unsigned local builds while still producing signed release artifacts in CI.
