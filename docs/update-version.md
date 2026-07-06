# Huong dan update version Donut Browser

Tai lieu nay mo ta cach project cap nhat version moi, cach release workflow chay, va cach app tu phat hien update sau khi release.

## Tong quan

Version release on dinh dung tag Git dang `vX.Y.Z`, vi du `v0.27.25`.

Project co 3 noi giu version can dong bo:

- `package.json`: version frontend/package root.
- `src-tauri/Cargo.toml`: version Rust crate, dung boi `CARGO_PKG_VERSION`.
- `src-tauri/tauri.conf.json`: version Tauri bundle, anh huong ten artifact va metadata app.

Release workflow chay khi push tag khop `v*`:

- File workflow chinh: `.github/workflows/release.yml`.
- Tag vi du: `v0.27.26`.
- Workflow build macOS, Linux, Windows, tao GitHub Release, upload artifacts, tao portable Windows ZIP.
- Sau release thanh cong, workflow cap nhat `CHANGELOG.md`, cap nhat link download trong `README.md`, commit nguoc ve `main`.
- Workflow phu tu dong chay sau Release: `.github/workflows/publish-repos.yml`, `.github/workflows/notify-telegram.yml`, docker sync, website deploy.

## Buoc update version

1. Chon version moi theo SemVer.

   Vi du version hien tai la `0.27.25`, patch moi la `0.27.26`.

2. Sua 3 file version.

   `package.json`:

   ```json
   "version": "0.27.26"
   ```

   `src-tauri/Cargo.toml`:

   ```toml
   version = "0.27.26"
   ```

   `src-tauri/tauri.conf.json`:

   ```json
   "version": "0.27.26"
   ```

3. Chay format, lint, test truoc khi release.

   ```bash
   pnpm format && pnpm lint && pnpm test
   ```

   Neu muon loc output test Rust dai:

   ```bash
   pnpm test 2>&1 | grep -E "test result|panicked|FAILED"
   ```

4. Commit thay doi version.

   ```bash
   git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
   git commit -m "chore: bump version to 0.27.26"
   ```

5. Tao tag release dung version co prefix `v`.

   ```bash
   git tag v0.27.26
   ```

6. Push commit va tag.

   ```bash
   git push origin main
   git push origin v0.27.26
   ```

7. Kiem tra GitHub Actions.

   ```bash
   gh run list --workflow Release --limit 5
   gh run watch
   ```

## Release workflow

Workflow `.github/workflows/release.yml` co trigger:

```yaml
on:
  push:
    tags:
      - "v*"
```

Luon push tag `vX.Y.Z`; neu chi push commit version ma khong push tag thi release workflow khong chay.

Workflow chinh co cac job/phan quan trong:

- `security-scan`: quet OSV bang `pnpm-lock.yaml` va `src-tauri/Cargo.lock`.
- `lint-js`: goi workflow lint JavaScript/TypeScript.
- `lint-rust`: goi workflow lint Rust.
- `codeql`: chay CodeQL.
- `spellcheck`: chay typos spellcheck.
- `release`: build artifacts tren matrix platform.
- `changelog`: tao changelog, cap nhat `README.md`, sua release notes.
- `notify-discord`: gui thong bao Discord neu co secret webhook.
- `deploy-website`: trigger Cloudflare Pages neu co deploy hook.
- `docker`: goi `.github/workflows/docker-sync.yml` voi tag release.

Matrix build trong job `release`:

- macOS ARM64: `aarch64-apple-darwin`.
- macOS Intel: `x86_64-apple-darwin`.
- Linux x86_64: `x86_64-unknown-linux-gnu`.
- Linux ARM64: `aarch64-unknown-linux-gnu`.
- Windows x64: `x86_64-pc-windows-msvc`.

Moi matrix thuc hien luong chinh:

1. Checkout source.
2. Cai pnpm, Node, Rust target.
3. Cai package he thong neu build Linux.
4. `pnpm install --frozen-lockfile`.
5. `pnpm exec next build`.
6. Build sidecar `donut-proxy` bang `cargo build --bin donut-proxy --target ... --release`.
7. Copy sidecar vao `src-tauri/binaries/donut-proxy-<target>`.
8. Build Tauri app bang `tauri-apps/tauri-action`.
9. Tao va upload Windows portable ZIP neu la Windows.

Artifacts GitHub Release duoc dat ten theo version trong Tauri bundle, vi du:

- `Donut_0.27.26_aarch64.dmg`.
- `Donut_0.27.26_x64.dmg`.
- `Donut_0.27.26_x64-setup.exe`.
- `Donut_0.27.26_x64-portable.zip`.
- `Donut_0.27.26_amd64.deb`.
- `Donut_0.27.26_arm64.deb`.
- `Donut-0.27.26-1.x86_64.rpm`.
- `Donut-0.27.26-1.aarch64.rpm`.
- `Donut_0.27.26_amd64.AppImage`.
- `Donut_0.27.26_aarch64.AppImage`.

## Build version trong app

Runtime version app khong doc truc tiep tu `package.json`. Rust build script `src-tauri/build.rs` inject bien `BUILD_VERSION` vao binary.

Thu tu uu tien trong `build.rs`:

1. Neu co `BUILD_TAG`, dung gia tri nay. Dung cho nightly/custom build.
2. Neu co `GITHUB_REF_NAME`, dung tag GitHub Actions. Stable release thanh `v0.27.26`.
3. Neu co `STABLE_RELEASE`, dung `v{CARGO_PKG_VERSION}`.
4. Neu co `GITHUB_SHA`, dung `nightly-{short_hash}`.
5. Neu local dev, dung `dev-{CARGO_PKG_VERSION}`.

`src-tauri/src/app_auto_updater.rs` doc version hien tai bang:

```rust
env!("BUILD_VERSION").to_string()
```

Ket qua:

- Release tu tag `v0.27.26` hien thi current version `v0.27.26`.
- Dev build hien thi `dev-0.27.26` va khong auto-update.
- Nightly build hien thi `nightly-<hash>` va chi so voi release tag `nightly-*`.

## Logic app auto-update

Logic nam o `src-tauri/src/app_auto_updater.rs`.

Command Tauri:

- `check_for_app_updates`: auto check, bi tat neu portable mode hoac user bat `disable_auto_updates`.
- `check_for_app_updates_manual`: user check thu cong, khong bi chan boi setting auto-update.
- `download_and_prepare_app_update`: tai asset va chuan bi cai update.
- `restart_application`: restart app sau khi update.

Luong check update:

1. Lay current version tu `BUILD_VERSION`.
2. Xac dinh build type:
   - Version bat dau bang `v` la stable.
   - Version bat dau bang `nightly-` la nightly.
   - Version bat dau bang `dev-` la local dev, khong auto-update.
3. Goi GitHub API:

   ```text
   https://api.github.com/repos/chiconghvan/donutbrowser/releases?per_page=100
   ```

4. Loc release:
   - Stable build chi lay tag bat dau bang `v`.
   - Nightly build chi lay tag bat dau bang `nightly-`.
5. Lay release moi nhat trong response.
6. So sanh version:
   - Stable dung SemVer `(major, minor, patch)`, bo prefix `v` neu co.
   - Nightly so sanh hash trong `nightly-<hash>`, khac hash thi update.
   - `dev-*` luon return false.
7. Chon asset phu hop platform.
8. Tra `AppUpdateInfo` cho frontend neu co update.

## Silent app update flow

App update duoc thiet ke theo flow silent: app tu check, tu download, tu prepare/install ngam, sau do user chi thay toast `Update ready` va bam `Restart Now`.

Frontend orchestration nam o `src/hooks/use-app-update-notifications.tsx`:

1. Khi app startup, hook goi `check_for_app_updates`.
2. Neu backend tra `AppUpdateInfo` va `manual_update_required` la `false`, hook khong hien toast ngay.
3. Hook tu dong goi `download_and_prepare_app_update` trong background.
4. Backend download va prepare update.
5. Backend emit event `app-update-ready`.
6. Hook set `updateReady = true`, tat state `isUpdating`, roi moi show `AppUpdateToast`.
7. Toast chi hien nut `Restart Now`; user khong can bam download/install.
8. Khi user bam `Restart Now`, frontend goi `restart_application`.

Dieu kien auto-download background trong hook:

```ts
if (
  !isClient ||
  !updateInfo ||
  updateInfo.manual_update_required ||
  isUpdating ||
  updateReady ||
  autoDownloadedVersion.current === updateInfo.new_version
)
  return;

autoDownloadedVersion.current = updateInfo.new_version;
void handleAppUpdate(updateInfo);
```

Nghia la:

- App chi auto-download khi co update hop le va khong yeu cau manual action.
- Moi version chi auto-download mot lan trong session qua `autoDownloadedVersion`.
- User khong thay prompt download. Toast chi hien khi update da ready hoac khi update can manual action.

Backend silent download/install nam o `download_and_prepare_update`:

1. Tao temp dir: `std::env::temp_dir().join("donut_app_update")`.
2. Lay filename tu `update_info.download_url`.
3. Goi `download_update_silent(...)` de tai file khong hien progress UI.
4. Extract archive bang `extract_update(...)`.
5. Prepare/install theo OS.
6. Emit event:

   ```rust
   events::emit("app-update-ready", update_info.new_version.clone())
   ```

### macOS silent update

Tren macOS, `download_and_prepare_update` cai update ngay trong background:

- Tai DMG.
- Extract `.app` tu DMG.
- Goi `install_update`.
- Move app hien tai sang backup.
- Move app moi vao dung vi tri.
- Remove quarantine attribute neu co.
- Xoa backup neu thanh cong.
- Emit `app-update-ready`.

Khi user bam `Restart Now`, `restart_application` tao script `donut_restart.sh`, doi process hien tai thoat, roi `open` app moi.

### Windows silent update

Tren Windows, installer `.exe` hoac `.msi` khong chay ngay luc download xong. Ly do: installer co the dong app dang chay, lam toast `Update ready` khong kip hien.

Flow Windows:

1. Tai installer silently.
2. Extract/resolve installer path.
3. Neu file la `.msi` hoac `.exe`, backend luu vao `PENDING_INSTALLER_PATH`.
4. Backend emit `app-update-ready`.
5. User bam `Restart Now`.
6. `restart_application` tao batch script `donut_update_restart.bat`.
7. Batch script doi PID app hien tai thoat.
8. Batch script chay installer silent.
9. Batch script start app moi.
10. Batch script tu xoa chinh no.

Lenh silent installer trong restart script:

```bat
start "" /wait "<installer.exe>" /S /UPDATE
```

voi MSI:

```bat
start "" /wait "<SystemRoot>\System32\msiexec.exe" /i "<installer.msi>" /quiet /norestart /promptrestart
```

Neu update Windows la ZIP thay vi installer, backend co the extract va replace binary trong `install_update` truoc khi emit ready. Release workflow hien tai upload Windows NSIS installer va portable ZIP; auto-updater uu tien asset phu hop platform.

### Linux silent/manual behavior

Linux co 2 truong hop:

- Neu apt/dnf/zypper repo da configured, backend tra `repo_update: true` va `manual_update_required: true`. App khong auto-download; toast bao update qua package manager.
- Neu khong co repo configured va co asset phu hop, app co the download/prepare tu GitHub asset.

Mot so Linux install path can quyen system, nen co the can prompt PolicyKit (`pkexec`) hoac package manager. Vi vay Linux khong dam bao silent hoan toan nhu macOS/Windows installer flow.

Linux co logic rieng:

- Neu detect apt/dnf/zypper repo da configure, app dat `repo_update: true` va `manual_update_required: true`.
- User nen update bang package manager thay vi download asset truc tiep.
- Neu khong co repo configured, app co the dung asset GitHub phu hop platform.

Portable mode:

- `check_for_app_updates` return `None` khi `crate::app_dirs::is_portable()` true.
- Windows portable ZIP khong tu update qua luong auto-update macOS/Windows installer binh thuong.

## Changelog va README sau release

Job `changelog` trong `.github/workflows/release.yml` chay sau khi job `release` thanh cong.

No tu dong:

1. Tim previous stable tag bang `git tag --sort=-version:refname` va regex `^v[0-9]+\.[0-9]+\.[0-9]+$`.
2. Lay commit subject trong range `PREV_TAG..TAG`.
3. Phan loai commit theo prefix:
   - `feat:` vao `Features`.
   - `fix:` vao `Bug Fixes`.
   - `refactor:` vao `Refactoring`.
   - `perf:` vao `Performance`.
   - `docs:` vao `Documentation`.
   - `build`, `ci`, `chore`, `test` vao `Maintenance`.
   - Con lai vao `Other`.
4. Chen entry moi vao dau `CHANGELOG.md` sau heading `# Changelog`.
5. Cap nhat section download trong `README.md` giua marker:

   ```md
   <!-- install-links-start -->
   <!-- install-links-end -->
   ```

6. Commit nguoc ve `main` voi message:

   ```text
   docs: update CHANGELOG.md and README.md for v0.27.26 [skip ci]
   ```

7. Cap nhat GitHub Release notes bang `/tmp/release-changelog.md`.

Vi job nay commit vao `main` sau release, local branch co the can pull lai:

```bash
git pull --ff-only origin main
```

## Linux repository publish

Workflow `.github/workflows/publish-repos.yml` chay theo 2 cach:

- Tu dong sau workflow `Release` thanh cong (`workflow_run`).
- Thu cong qua `workflow_dispatch` voi input `tag`.

No goi script:

```bash
bash scripts/publish-repo.sh "<tag>"
```

Script tai `.deb` va `.rpm` tu GitHub Release, tao metadata repo apt/rpm, roi publish len Cloudflare R2.

Secrets can co:

- `R2_ACCESS_KEY_ID`.
- `R2_SECRET_ACCESS_KEY`.
- `R2_ENDPOINT_URL`.
- `R2_BUCKET_NAME`.

Chay lai thu cong neu workflow fail:

```bash
gh workflow run publish-repos.yml -f tag=v0.27.26
```

## Telegram va Discord notify

Telegram workflow nam o `.github/workflows/notify-telegram.yml`.

Ly do no dung `workflow_run` thay vi `release: published`:

- Release duoc tao bang `GITHUB_TOKEN` trong `tauri-action`.
- GitHub khong kich hoat event `release: published` cho release tao bang `GITHUB_TOKEN` de tranh recursive workflow.
- Vi vay workflow Telegram chain theo Release workflow thanh cong.

Telegram chi announce stable semver tag:

- Chap nhan `vX.Y.Z`.
- Bo qua `nightly*`.
- Bo qua prerelease suffix nhu `v1.0.0-rc1`.
- Bo qua GitHub Release duoc mark prerelease.

Secrets can co:

- `TELEGRAM_BOT_TOKEN`.
- `TELEGRAM_CHAT_ID`.

Chay lai thu cong:

```bash
gh workflow run notify-telegram.yml -f tag=v0.27.26
```

Discord notify nam trong job `notify-discord` cua `.github/workflows/release.yml`. No chi gui neu co `DISCORD_STABLE_WEBHOOK_URL`.

## Website va Docker sau release

Trong `.github/workflows/release.yml`:

- Job `deploy-website` goi `CLOUDFLARE_WEB_DEPLOYMENT_HOOK` neu secret ton tai.
- Job `docker` goi `.github/workflows/docker-sync.yml` voi input `tag: github.ref_name`.

## Release build thu cong cho Windows

Workflow `.github/workflows/release-build.yml` la workflow `workflow_dispatch`, build Windows tren `windows-latest`.

No:

- Build frontend.
- Build sidecar `donut-proxy`.
- Build Tauri app.
- Tao portable ZIP.
- Tao GitHub Release va upload Windows installer + portable ZIP.

Workflow nay khong thay the release workflow chinh vi chi build Windows va khong chay full matrix macOS/Linux.

## Checklist truoc khi release

- Version trong `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` da dong bo.
- Commit message bump version dung dang `chore: bump version to X.Y.Z` neu muon changelog vao Maintenance.
- `pnpm format && pnpm lint && pnpm test` pass.
- Tag dung dang `vX.Y.Z`.
- `git push origin main` da xong truoc khi push tag.
- `git push origin vX.Y.Z` da kich hoat `.github/workflows/release.yml`.
- GitHub Release co du artifact cho macOS, Windows, Linux.
- `CHANGELOG.md` va `README.md` da duoc bot commit nguoc ve `main`.
- `publish-repos.yml` thanh cong neu can Linux apt/rpm repo.
- Telegram/Discord/website workflow thanh cong neu co cau hinh secret.

## Loi hay gap

### Push commit nhung khong co release

Nguyen nhan: workflow chi trigger khi push tag `v*`.

Fix:

```bash
git tag v0.27.26
git push origin v0.27.26
```

### App bao version dev va khong update

Nguyen nhan: build local khong co `GITHUB_REF_NAME`, `STABLE_RELEASE`, hoac `BUILD_TAG`, nen `build.rs` inject `dev-{CARGO_PKG_VERSION}`.

Fix: release build phai chay qua tag workflow, hoac set env phu hop khi build custom.

### Auto-update khong thay version moi

Kiem tra:

- GitHub Release ton tai va khong phai draft.
- Tag moi bat dau bang `v` neu app hien tai la stable.
- Asset dung platform da duoc upload.
- Current version nho hon new version theo SemVer.
- App khong o portable mode.
- User khong bat `disable_auto_updates` neu check tu dong.

### Linux user thay manual update

Nguyen nhan: app detect apt/dnf/zypper repo da configured.

Ky vong: app tra `repo_update: true`, user update bang package manager.

### Changelog bi thieu muc

Nguyen nhan: commit subject khong co prefix conventional commit.

Fix: dung prefix `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `build:`, `test:`, `refactor:`, `perf:` truoc khi tag release.
