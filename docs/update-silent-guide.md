# Silent App Update Workflow

This guide describes full silent self-update flow for Donut Browser, from update fetch to download, deferred installer command generation, NSIS silent install, app restart, and new-version launch.

## Goal

User experience target:

1. App checks for update in background.
2. App downloads update in background.
3. App prepares update without showing installer UI.
4. User sees only `Update ready` toast.
5. User clicks `Restart Now`.
6. Old app exits.
7. Installer runs silently.
8. New app starts automatically.
9. User lands in updated app with no NSIS wizard, no console window, no extra prompt.

Windows is special because `.exe` and `.msi` installers usually need current app closed before replacing files. Therefore Windows installer execution is deferred until user clicks `Restart Now`.

## Source Map

Main files:

- `src/hooks/use-app-update-notifications.tsx`: frontend orchestration.
- `src/components/app-update-toast.tsx`: update-ready toast and restart button.
- `src-tauri/src/app_auto_updater.rs`: update fetch, asset selection, download, prepare, install, restart.
- `src-tauri/tauri.conf.json`: bundle targets, including Windows NSIS.
- `.github/workflows/release.yml`: release build and GitHub Release asset upload.

Tauri commands:

- `check_for_app_updates`: automatic update check, skipped in portable mode and when app self-updates are disabled.
- `check_for_app_updates_manual`: manual check, not blocked by auto-update setting.
- `download_and_prepare_app_update`: background download and preparation.
- `restart_application`: restart app, and on Windows run pending installer first.

Events:

- `app-update-available`: backend can announce available update.
- `app-update-progress`: progress event type exists for UI state.
- `app-update-ready`: emitted after update is downloaded/prepared and ready for restart.

## Release Artifact Requirements

Silent update depends on release assets being named and uploaded consistently.

Stable release tag:

```text
vX.Y.Z
```

Windows NSIS asset expected by update selection:

```text
Donut_X.Y.Z_x64-setup.exe
```

Example:

```text
Donut_0.27.26_x64-setup.exe
```

Build config enables NSIS in `src-tauri/tauri.conf.json`:

```json
"targets": ["app", "dmg", "nsis", "deb", "rpm", "appimage"]
```

Release workflow builds Windows with:

```yaml
args: "--target x86_64-pc-windows-msvc --verbose"
```

`tauri-apps/tauri-action` invokes `pnpm tauri build`, and Tauri creates NSIS installer under target bundle output. GitHub Release must contain setup `.exe`; otherwise updater cannot auto-download Windows installer.

## Build-Time Version

Runtime version does not come from `package.json` directly. Rust reads build-time `BUILD_VERSION`:

```rust
env!("BUILD_VERSION").to_string()
```

`src-tauri/build.rs` chooses version in this order:

1. `BUILD_TAG` if provided.
2. `GITHUB_REF_NAME` in GitHub Actions, for example `v0.27.26`.
3. `STABLE_RELEASE`, becoming `v{CARGO_PKG_VERSION}`.
4. `GITHUB_SHA`, becoming `nightly-{short_hash}`.
5. Local dev fallback, becoming `dev-{CARGO_PKG_VERSION}`.

Update behavior:

- `v*`: stable build, checks stable release tags only.
- `nightly-*`: nightly build, checks nightly release tags only.
- `dev-*`: local dev build, never auto-updates.

## Fetch Update

Frontend startup flow:

1. `useAppUpdateNotifications()` mounts.
2. Hook calls `check_for_app_updates` after client is ready.
3. Backend returns `Option<AppUpdateInfo>`.
4. If no update, UI does nothing.
5. If update exists and version was not dismissed, hook stores `updateInfo`.

Backend fetch flow in `AppAutoUpdater::check_for_updates()`:

1. Read current version from `BUILD_VERSION`.
2. Detect stable/nightly/dev build.
3. Fetch GitHub releases:

```text
https://api.github.com/repos/chiconghvan/donutbrowser/releases?per_page=100
```

4. Filter releases by build type:

- Stable build: tags starting with `v`.
- Nightly build: tags starting with `nightly-`.

5. Pick latest release from filtered result.
6. Compare current version vs latest release.
7. Choose matching asset for current OS/architecture.
8. Return `AppUpdateInfo`.

`AppUpdateInfo` includes:

```rust
pub struct AppUpdateInfo {
  pub current_version: String,
  pub new_version: String,
  pub release_notes: String,
  pub download_url: String,
  pub is_nightly: bool,
  pub published_at: String,
  pub manual_update_required: bool,
  pub release_page_url: Option<String>,
  pub repo_update: bool,
}
```

Silent flow continues only when:

```text
manual_update_required == false
```

## Asset Selection

Windows selection priority:

```text
MSI > EXE > ZIP
```

Current release artifacts use NSIS `.exe`, so Windows normally picks:

```text
Donut_X.Y.Z_x64-setup.exe
```

Matching checks include exact architecture tokens:

```text
_x64.exe
-x64.exe
_x64_
-x64-
_x64-
```

For x64 fallback, `x86_64` and `x86-64` are accepted.

If no suitable asset exists, updater returns manual update path instead of silent update.

## Silent Download

Frontend auto-download trigger:

1. `updateInfo` exists.
2. `manual_update_required` is false.
3. Not already updating.
4. Update not already ready.
5. Same version was not already auto-downloaded in this session.
6. Hook invokes `download_and_prepare_app_update`.

Backend download flow:

1. Create temp directory:

```text
%TEMP%\donut_app_update
```

2. Derive filename from `download_url`.
3. Download with `reqwest` streaming response body.
4. Use buffered file writer with 8 MiB buffer.
5. Flush file to disk.

Relevant code path:

```rust
let temp_dir = std::env::temp_dir().join("donut_app_update");
fs::create_dir_all(&temp_dir)?;

let download_path = self
  .download_update_silent(&update_info.download_url, &temp_dir, &filename)
  .await?;
```

No installer UI appears during this phase.

## Prepare Update

After download, backend calls:

```rust
let extracted_app_path = self.extract_update(&download_path, &temp_dir).await?;
```

For Windows `.exe`:

```rust
Ok(archive_path.to_path_buf())
```

For Windows `.msi`:

```rust
Ok(archive_path.to_path_buf())
```

Reason: installer files cannot be extracted like normal archives for this flow; they must be executed.

## Windows Deferred Install

Windows `.exe` and `.msi` installers are not run during `download_and_prepare_app_update`.

Reason:

- Running installer immediately can close current app.
- If current app dies before toast appears, user never gets clean `Update ready` state.
- Running installer while app files are locked can fail or cause partial install.

Current behavior:

```rust
if ext == "msi" || ext == "exe" {
  *PENDING_INSTALLER_PATH.lock().unwrap() = Some(extracted_app_path);
} else {
  self.install_update(&extracted_app_path).await?;
}
```

Then backend emits:

```rust
events::emit("app-update-ready", update_info.new_version.clone());
```

Frontend receives `app-update-ready`, sets `updateReady = true`, and shows toast with `Restart Now`.

## Restart Button Flow

User clicks `Restart Now`.

Frontend calls:

```ts
await invoke("restart_application");
```

Backend enters `AppAutoUpdater::restart_application()`.

On Windows:

1. Take pending installer path from `PENDING_INSTALLER_PATH`.
2. Get current app executable path.
3. Get current process PID.
4. Write batch script to temp:

```text
%TEMP%\donut_update_restart.bat
```

5. Spawn `cmd /C <script>` with `CREATE_NO_WINDOW`.
6. Sleep 500 ms.
7. Exit current app process with `std::process::exit(0)`.

## Generated CMD Script

For pending Windows installer, generated batch script has this shape:

```bat
@echo off
:w
tasklist /fi "PID eq <current_pid>" 2>nul | find "<current_pid>" >nul && (timeout /t 1 /nobreak >nul & goto w)
<install_command>
timeout /t 1 /nobreak >nul
start "" "<current_app_exe>"
del "%~f0"
```

Important details:

- `tasklist` loop waits until old app process is gone.
- `timeout /t 1 /nobreak >nul` avoids visible output and gives file locks time to release.
- `<install_command>` uses `start "" /wait ...` so script blocks until installer exits.
- Relaunch happens only after installer finishes.
- `del "%~f0"` deletes batch script after execution.

Rust spawns script hidden:

```rust
use std::os::windows::process::CommandExt;
const CREATE_NO_WINDOW: u32 = 0x08000000;

Command::new("cmd")
  .args(["/C", script_path.to_str().unwrap()])
  .creation_flags(CREATE_NO_WINDOW)
  .spawn()?;
```

`CREATE_NO_WINDOW` is what keeps `cmd.exe` invisible.

## NSIS Silent Install Command

For Tauri NSIS `.exe`, generated install command is:

```bat
start "" /wait "<installer_path>" /S /UPDATE
```

Meaning:

- `start ""`: empty window title required by Windows `start` syntax.
- `/wait`: batch script waits until installer exits.
- `"<installer_path>"`: downloaded NSIS setup executable.
- `/S`: NSIS silent mode, uppercase `S` required.
- `/UPDATE`: Tauri/NSIS update mode flag used by current code.

Full generated script example:

```bat
@echo off
:w
tasklist /fi "PID eq 12345" 2>nul | find "12345" >nul && (timeout /t 1 /nobreak >nul & goto w)
start "" /wait "C:\Users\Alice\AppData\Local\Temp\donut_app_update\Donut_0.27.26_x64-setup.exe" /S /UPDATE
timeout /t 1 /nobreak >nul
start "" "C:\Program Files\Donut\donutbrowser.exe"
del "%~f0"
```

This is silent from user click to relaunched app when installer does not require elevation or does not show UAC.

## MSI Silent Install Command

If selected asset is `.msi`, generated install command is:

```bat
start "" /wait "<SystemRoot>\System32\msiexec.exe" /i "<installer_path>" /quiet /norestart /promptrestart
```

Meaning:

- `/i`: install package.
- `/quiet`: no installer UI.
- `/norestart`: installer must not reboot machine automatically.
- `/promptrestart`: prompt only if restart is required.
- `/wait`: script waits until `msiexec` exits.

Full generated script example:

```bat
@echo off
:w
tasklist /fi "PID eq 12345" 2>nul | find "12345" >nul && (timeout /t 1 /nobreak >nul & goto w)
start "" /wait "C:\Windows\System32\msiexec.exe" /i "C:\Users\Alice\AppData\Local\Temp\donut_app_update\Donut_0.27.26_x64.msi" /quiet /norestart /promptrestart
timeout /t 1 /nobreak >nul
start "" "C:\Program Files\Donut\donutbrowser.exe"
del "%~f0"
```

## Why Installer Runs After App Exit

Silent Windows update needs old app closed before install because:

- App executable can be locked by running process.
- Sidecar binaries can be locked.
- WebView/runtime files can be in use.
- NSIS may terminate app as part of install.
- Running install before `Update ready` can kill frontend state.

Therefore correct sequence is:

```text
download -> prepare -> mark pending installer -> show Update ready -> user clicks Restart Now -> spawn hidden cmd -> exit old app -> wait PID gone -> run installer silent -> relaunch app
```

## Full Windows Timeline

1. App starts.
2. Frontend hook invokes `check_for_app_updates`.
3. Rust fetches GitHub releases.
4. Rust filters stable/nightly releases.
5. Rust compares `BUILD_VERSION` to latest tag.
6. Rust selects `Donut_X.Y.Z_x64-setup.exe`.
7. Frontend receives `AppUpdateInfo`.
8. Frontend invokes `download_and_prepare_app_update` automatically.
9. Rust downloads installer to `%TEMP%\donut_app_update`.
10. Rust returns downloaded `.exe` path from `extract_update`.
11. Rust stores path in `PENDING_INSTALLER_PATH`.
12. Rust emits `app-update-ready`.
13. Frontend shows `Update ready` toast.
14. User clicks `Restart Now`.
15. Frontend invokes `restart_application`.
16. Rust writes `%TEMP%\donut_update_restart.bat`.
17. Rust spawns `cmd /C %TEMP%\donut_update_restart.bat` with `CREATE_NO_WINDOW`.
18. Rust exits old app.
19. Batch waits until old PID disappears.
20. Batch runs NSIS command: `start "" /wait "<installer>" /S /UPDATE`.
21. NSIS installs new version silently.
22. Batch waits 1 second.
23. Batch starts app executable.
24. Batch deletes itself.
25. New app starts and reports new `BUILD_VERSION`.

## Conditions For Truly Silent UX

All conditions must hold:

- User installed app in a location writable by installer without extra prompt, or installer elevation behavior is already handled.
- NSIS installer honors `/S`.
- Installer does not force reboot.
- App process exits quickly after `std::process::exit(0)`.
- Antivirus or SmartScreen does not block unsigned installer.
- Release asset exists and matches platform selection.
- Portable mode is off.
- App self-updates are not disabled by setting.

Unsigned Windows builds may still trigger SmartScreen. That is outside app control and breaks full silent UX.

## NSIS Build Notes

Tauri builds NSIS because `nsis` target is enabled:

```json
"targets": ["app", "dmg", "nsis", "deb", "rpm", "appimage"]
```

Windows release command path:

```text
tauri-apps/tauri-action -> pnpm tauri build --target x86_64-pc-windows-msvc --verbose
```

Local equivalent:

```bash
pnpm exec next build
pnpm copy-proxy-binary
pnpm tauri build --target x86_64-pc-windows-msvc --verbose
```

Expected NSIS output location:

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe
```

Expected release filename:

```text
Donut_X.Y.Z_x64-setup.exe
```

## Logging

Useful log lines in app log:

```text
=== App Update Check ===
Fetched <n> releases from GitHub
Update available!
Starting background update download and install
Silent download completed: <path>
Deferring Windows installer execution until user-initiated restart
Update ready, emitting app-update-ready event
```

On Windows, verify generated script path:

```text
%TEMP%\donut_update_restart.bat
```

It deletes itself after success, so inspect during update or temporarily disable `del "%~f0"` in a debug branch.

## Failure Points

Common causes of non-silent or failed update:

- Release missing `Donut_X.Y.Z_x64-setup.exe`.
- Current build is `dev-*`, so auto-update is intentionally disabled.
- App runs in portable mode.
- User setting disables app self-updates.
- NSIS installer not accepting `/S` due custom installer change.
- Installer needs elevation and Windows shows UAC.
- SmartScreen blocks unsigned installer.
- Old app does not exit, so batch waits forever in PID loop.
- Installed path differs from relaunched `current_exe()` path.
- Installer exits non-zero but batch still starts app because current script does not check `%ERRORLEVEL%`.

## Recommended Hardening

Current flow is workable, but these changes make it safer:

1. Write installer exit code to a temp log before relaunch.
2. Only relaunch app if installer returns `0` or known success code.
3. Add max wait timeout for old PID loop.
4. Quote paths exactly as current script does; never build unquoted commands.
5. Keep `CREATE_NO_WINDOW` for hidden `cmd`.
6. Keep Windows installer execution deferred until `restart_application`.
7. Sign Windows installer to reduce SmartScreen interruptions.
8. Keep release asset naming stable so platform selector finds NSIS setup.

Example stricter batch shape:

```bat
@echo off
set LOG=%TEMP%\donut_update_restart.log
:w
tasklist /fi "PID eq <current_pid>" 2>nul | find "<current_pid>" >nul && (timeout /t 1 /nobreak >nul & goto w)
start "" /wait "<installer_path>" /S /UPDATE
set EXITCODE=%ERRORLEVEL%
echo installer_exit=%EXITCODE% > "%LOG%"
if "%EXITCODE%"=="0" start "" "<current_app_exe>"
del "%~f0"
```

Do not add visible `pause`, `echo`, or installer UI flags in production silent flow.
