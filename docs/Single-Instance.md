# Cơ chế Single Instance (Chỉ mở một cửa sổ duy nhất)

Khi người dùng double-click vào app để mở lại trong khi app đã chạy, Donut Browser **không tạo process mới** — thay vào đó nó hiện/focus cửa sổ đang có sẵn. Cơ chế này hoạt động nhờ:

## 1. `tauri-plugin-single-instance` (chính)

**File:** `src-tauri/src/lib.rs:566–575`

```rust
.plugin(tauri_plugin_single_instance::init(
  |app_handle, args, _cwd| {
    log::info!("Single instance triggered with args: {args:?}");
    if let Some(window) = app_handle.get_webview_window("main") {
      let _ = window.show();
      let _ = window.set_focus();
      let _ = window.unminimize();
    }
  },
))
```

Plugin này intercept lần launch thứ hai và dùng platform-specific primitive để phát hiện instance đang chạy:

| Platform | Cơ chế |
|----------|--------|
| **Windows** | Named kernel mutex (`CreateMutexW` / `OpenMutexW`) — process thứ hai thấy mutex đã tồn tại, gửi args về instance đầu qua internal channel, rồi tự thoát. |
| **Linux** | D-Bus (crate `zbus`) — instance đầu đăng ký một tên D-Bus; instance sau dò thấy tên đó và chuyển tiếp command-line arguments. |
| **macOS** | NSApplication lifecycle — macOS `.app` bundle đã ngăn double-launch native; plugin hook vào delegate `applicationShouldHandleReopen` để forward event. |

Callback ở instance đầu chỉ đơn giản: **show** → **focus** → **unminimize** cửa sổ `main`.

## 2. macOS `Reopen` Event (dự phòng)

**File:** `src-tauri/src/lib.rs:1246–1255`

```rust
.run(|_app_handle, _event| {
  #[cfg(target_os = "macos")]
  if let tauri::RunEvent::Reopen { .. } = _event {
    if let Some(window) = _app_handle.get_webview_window("main") {
      let _ = window.show();
      let _ = window.set_focus();
      let _ = window.unminimize();
    }
  }
});
```

Defense-in-depth cho macOS: khi user click icon Dock hoặc hệ thống gửi Apple Event `Reopen` (ví dụ double-click `.app`), handler này cũng show/focus/unminimize window — kể cả khi plugin single-instance không kịp can thiệp.

## 3. Không có custom lock file hay mutex tự viết

Project **không** dùng lock file, file PID, hay mutex Rust tự code. Toàn bộ trách nhiệm chống multi-instance được giao cho `tauri-plugin-single-instance` crate (v2.4.2, khai báo tại `src-tauri/Cargo.toml:39`).

## Luồng tổng thể

```
User double-click app (app đã chạy)
        │
        ▼
Hệ điều hành launch process mới
        │
        ▼
tauri-plugin-single-instance phát hiện
instance cũ qua mutex/D-Bus/NSApp
        │
        ├── Gửi args (nếu có) về instance cũ
        └── Thoát process mới ngay lập tức
                │
                ▼
Instance cũ nhận callback
        │
        ▼
show() → set_focus() → unminimize() window "main"
```
