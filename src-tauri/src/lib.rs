// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_window_state::{Builder as WindowStateBuilder, StateFlags};

// Store pending URLs that need to be handled when the window is ready
static PENDING_URLS: Mutex<Vec<String>> = Mutex::new(Vec::new());

// Set to true once the user has confirmed they want to quit, so the close
// interceptor lets the next CloseRequested through instead of looping back
// to the confirmation dialog.
static QUIT_CONFIRMED: AtomicBool = AtomicBool::new(false);

mod api_client;
mod api_server;
mod app_auto_updater;
pub mod app_dirs;
mod auto_updater;
mod browser;
mod browser_runner;
mod browser_version_manager;
pub mod camoufox;
mod camoufox_manager;
mod default_browser;
pub mod dns_blocklist;
mod downloaded_browsers_registry;
mod downloader;
mod ephemeral_dirs;
mod extension_manager;
mod extraction;
mod geoip_downloader;
mod group_manager;
mod ip_utils;
mod platform_browser;
mod profile;
mod profile_importer;
mod proxy_manager;
pub mod proxy_runner;
pub mod proxy_server;
pub mod proxy_storage;
mod settings_manager;

pub mod traffic_stats;
mod wayfern_manager;
mod wayfern_terms;
// mod theme_detector; // removed: theme detection handled in webview via CSS prefers-color-scheme

mod commercial_license;
mod cookie_manager;
pub mod events;

mod tag_manager;
mod team_lock;
mod version_updater;


use browser_runner::{
  check_browser_exists, kill_browser_profile, launch_browser_profile, open_url_with_profile,
};

use profile::manager::{
  check_browser_status, clone_profile, create_browser_profile_new, create_browser_profiles_bulk,
  delete_profile, list_browser_profiles, rename_profile, update_camoufox_config,
  update_profile_dns_blocklist, update_profile_launch_hook, update_profile_note,
  update_profile_proxy, update_profile_proxy_bypass_rules, update_profile_tags,
  update_wayfern_config,
};

use profile::password::{
  change_profile_password, is_profile_locked, lock_profile, remove_profile_password,
  set_profile_password, unlock_profile, verify_profile_password,
};

use browser_version_manager::{
  fetch_browser_versions_cached_first, fetch_browser_versions_with_count,
  fetch_browser_versions_with_count_cached_first, get_supported_browsers,
  is_browser_supported_on_platform,
};

use downloaded_browsers_registry::{
  check_missing_binaries, ensure_active_browsers_downloaded, ensure_all_binaries_exist,
  get_downloaded_browser_versions,
};

use downloader::{cancel_download, download_browser};

use settings_manager::{
  complete_onboarding, dismiss_window_resize_warning, get_app_settings, get_data_dir_settings,
  get_onboarding_completed, get_system_info, get_system_language,
  get_table_sorting_settings, get_window_resize_warning_dismissed, open_log_directory,
  read_log_files, save_app_settings, save_data_dir_settings,
  save_table_sorting_settings,
};

use tag_manager::get_all_tags;

use default_browser::{is_default_browser, set_as_default_browser};

use version_updater::{
  clear_all_version_cache_and_refetch, get_version_update_status, get_version_updater,
  trigger_manual_version_update,
};

use auto_updater::{
  check_for_browser_updates, complete_browser_update_with_auto_update, dismiss_update_notification,
};

use app_auto_updater::{
  check_for_app_updates, check_for_app_updates_manual, download_and_prepare_app_update,
  restart_application,
};

use profile_importer::{detect_existing_profiles, import_browser_profile};

use extension_manager::{
  add_extension, add_extension_to_group, assign_extension_group_to_profile, create_extension_group,
  delete_extension, delete_extension_group, get_extension_group_for_profile, get_extension_icon,
  list_extension_groups, list_extensions, remove_extension_from_group, update_extension,
  update_extension_group,
};

use group_manager::{
  assign_profiles_to_group, create_profile_group, delete_profile_group, delete_selected_profiles,
  get_groups_with_profile_counts, get_profile_groups, update_profile_group,
};

use geoip_downloader::{check_missing_geoip_database, GeoIPDownloader};

use browser_version_manager::get_browser_release_types;

use api_server::{get_api_server_status, start_api_server, stop_api_server};

// Trait to extend WebviewWindow with transparent titlebar functionality
pub trait WindowExt {
  #[cfg(target_os = "macos")]
  fn set_transparent_titlebar(&self, transparent: bool) -> Result<(), String>;

  #[cfg(target_os = "macos")]
  fn disable_native_fullscreen(&self) -> Result<(), String>;
}

impl<R: Runtime> WindowExt for WebviewWindow<R> {
  #[cfg(target_os = "macos")]
  fn set_transparent_titlebar(&self, transparent: bool) -> Result<(), String> {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSWindow, NSWindowStyleMask, NSWindowTitleVisibility};

    unsafe {
      let ns_window: Retained<NSWindow> =
        Retained::retain(self.ns_window().unwrap().cast()).unwrap();

      if transparent {
        // Hide the title text
        ns_window.setTitleVisibility(NSWindowTitleVisibility(1)); // NSWindowTitleHidden

        // Make titlebar transparent
        ns_window.setTitlebarAppearsTransparent(true);

        // Set full size content view
        let current_mask = ns_window.styleMask();
        let new_mask = NSWindowStyleMask(current_mask.0 | (1 << 15)); // NSFullSizeContentViewWindowMask
        ns_window.setStyleMask(new_mask);
      } else {
        // Show the title text
        ns_window.setTitleVisibility(NSWindowTitleVisibility(0)); // NSWindowTitleVisible

        // Make titlebar opaque
        ns_window.setTitlebarAppearsTransparent(false);

        // Remove full size content view
        let current_mask = ns_window.styleMask();
        let new_mask = NSWindowStyleMask(current_mask.0 & !(1 << 15));
        ns_window.setStyleMask(new_mask);
      }
    }

    Ok(())
  }

  #[cfg(target_os = "macos")]
  fn disable_native_fullscreen(&self) -> Result<(), String> {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    unsafe {
      let ns_window: Retained<NSWindow> =
        Retained::retain(self.ns_window().unwrap().cast()).unwrap();
      let mut collection_behavior = ns_window.collectionBehavior();
      collection_behavior.remove(NSWindowCollectionBehavior::FullScreenPrimary);
      collection_behavior.insert(NSWindowCollectionBehavior::FullScreenNone);
      ns_window.setCollectionBehavior(collection_behavior);
    }

    Ok(())
  }
}

// Called internally for deep-link / startup URL handling — not invoked from the
// frontend, so it is intentionally not a `#[tauri::command]`.
async fn handle_url_open(app: tauri::AppHandle, url: String) -> Result<(), String> {
  log::info!("handle_url_open called with URL: {url}");

  // Check if the main window exists and is ready
  if let Some(window) = app.get_webview_window("main") {
    log::debug!("Main window exists");

    // Try to show and focus the window first
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.unminimize();

    events::emit("show-profile-selector", url.clone())
      .map_err(|e| format!("Failed to emit URL open event: {e}"))?;
  } else {
    // Window doesn't exist yet - add to pending URLs
    log::debug!("Main window doesn't exist, adding URL to pending list");
    let mut pending = PENDING_URLS.lock().unwrap();
    pending.push(url);
  }

  Ok(())
}

#[tauri::command]
async fn read_profile_cookies(
  profile_id: String,
) -> Result<cookie_manager::CookieReadResult, String> {
  tokio::task::spawn_blocking(move || cookie_manager::CookieManager::read_cookies(&profile_id))
    .await
    .map_err(|e| format!("Failed to read profile cookies: {e}"))?
}

#[tauri::command]
async fn get_profile_cookie_stats(
  profile_id: String,
) -> Result<cookie_manager::CookieStats, String> {
  tokio::task::spawn_blocking(move || cookie_manager::CookieManager::read_stats(&profile_id))
    .await
    .map_err(|e| format!("Failed to read profile cookie stats: {e}"))?
}

#[tauri::command]
async fn copy_profile_cookies(
  app_handle: tauri::AppHandle,
  request: cookie_manager::CookieCopyRequest,
) -> Result<Vec<cookie_manager::CookieCopyResult>, String> {
  let _target_ids = request.target_profile_ids.clone();
  let results = cookie_manager::CookieManager::copy_cookies(&app_handle, request).await?;

  Ok(results)
}

#[tauri::command]
async fn import_cookies_from_file(
  app_handle: tauri::AppHandle,
  profile_id: String,
  content: String,
) -> Result<cookie_manager::CookieImportResult, String> {
  let result =
    cookie_manager::CookieManager::import_cookies(&app_handle, &profile_id, &content).await?;

  Ok(result)
}

#[tauri::command]
async fn export_profile_cookies(profile_id: String, format: String) -> Result<String, String> {
  cookie_manager::CookieManager::export_cookies(&profile_id, &format)
}

#[tauri::command]
fn check_wayfern_terms_accepted() -> bool {
  wayfern_terms::WayfernTermsManager::instance().is_terms_accepted()
}

#[tauri::command]
fn check_wayfern_downloaded() -> bool {
  wayfern_terms::WayfernTermsManager::instance().is_wayfern_downloaded()
}

#[tauri::command]
async fn accept_wayfern_terms() -> Result<(), String> {
  wayfern_terms::WayfernTermsManager::instance()
    .accept_terms()
    .await
}

#[tauri::command]
async fn get_commercial_trial_status(
  app_handle: tauri::AppHandle,
) -> Result<commercial_license::TrialStatus, String> {
  commercial_license::CommercialLicenseManager::instance()
    .get_trial_status(&app_handle)
    .await
}

#[tauri::command]
async fn acknowledge_trial_expiration(app_handle: tauri::AppHandle) -> Result<(), String> {
  commercial_license::CommercialLicenseManager::instance()
    .acknowledge_expiration(&app_handle)
    .await
}

#[tauri::command]
fn has_acknowledged_trial_expiration(app_handle: tauri::AppHandle) -> Result<bool, String> {
  commercial_license::CommercialLicenseManager::instance().has_acknowledged(&app_handle)
}



#[tauri::command]
async fn is_geoip_database_available() -> Result<bool, String> {
  Ok(GeoIPDownloader::is_geoip_database_available())
}

#[tauri::command]
async fn get_all_traffic_snapshots() -> Result<Vec<crate::traffic_stats::TrafficSnapshot>, String> {
  // Use real-time snapshots that merge in-memory data with disk data
  Ok(crate::traffic_stats::get_all_traffic_snapshots_realtime())
}

#[tauri::command]
async fn get_profile_traffic_snapshot(
  profile_id: String,
) -> Result<Option<crate::traffic_stats::TrafficSnapshot>, String> {
  Ok(crate::traffic_stats::get_traffic_snapshot_for_profile(
    &profile_id,
  ))
}

#[tauri::command]
async fn clear_all_traffic_stats() -> Result<(), String> {
  crate::traffic_stats::clear_all_traffic_stats()
    .map_err(|e| format!("Failed to clear traffic stats: {e}"))
}

#[tauri::command]
async fn get_traffic_stats_for_period(
  profile_id: String,
  seconds: u64,
) -> Result<Option<crate::traffic_stats::FilteredTrafficStats>, String> {
  Ok(crate::traffic_stats::get_traffic_stats_for_period(
    &profile_id,
    seconds,
  ))
}

#[tauri::command]
async fn download_geoip_database(app_handle: tauri::AppHandle) -> Result<(), String> {
  let downloader = GeoIPDownloader::instance();
  downloader
    .download_geoip_database(&app_handle)
    .await
    .map_err(|e| format!("Failed to download GeoIP database: {e}"))
}

/// Validate that a profile's selected proxy actually works before the profile
/// is created. Shared by the Tauri command and REST API paths so a
/// dead/unreachable proxy fails creation identically everywhere. Returns
/// structured `{ "code": ... }` error strings the frontend translates via
/// backend-errors.ts.
pub async fn validate_profile_network(
  proxy: Option<&str>,
) -> Result<(), String> {
  if let Some(proxy) = proxy.filter(|s| !s.is_empty()) {
    let settings = crate::proxy_manager::parse_profile_proxy_string(proxy)
      .map_err(|_| serde_json::json!({ "code": "INVALID_PROXY_FORMAT" }).to_string())?;
    match crate::proxy_manager::PROXY_MANAGER
      .check_proxy_validity(proxy, &settings)
      .await
    {
      Ok(result) if result.is_valid => {}
      Ok(_) => {
        return Err(serde_json::json!({ "code": "PROXY_NOT_WORKING" }).to_string());
      }
      Err(err) if err.contains("402") => {
        return Err(serde_json::json!({ "code": "PROXY_PAYMENT_REQUIRED" }).to_string());
      }
      Err(_) => {
        return Err(serde_json::json!({ "code": "PROXY_NOT_WORKING" }).to_string());
      }
    }
  }

  Ok(())
}

#[tauri::command]
async fn generate_sample_fingerprint(
  app_handle: tauri::AppHandle,
  browser: String,
  version: String,
  config_json: String,
) -> Result<String, String> {
  let temp_profile = crate::profile::BrowserProfile {
    id: uuid::Uuid::new_v4(),
    name: "temp_fingerprint_gen".to_string(),
    browser: browser.clone(),
    version: version.clone(),
    proxy: None,
    vpn_id: None,
    process_id: None,
    launch_hook: None,
    last_launch: None,
    release_type: "stable".to_string(),
    camoufox_config: None,
    wayfern_config: None,
    group_id: None,
    tags: Vec::new(),
    note: None,
    sync_mode: crate::profile::types::SyncMode::Disabled,
    encryption_salt: None,
    last_sync: None,
    host_os: None,
    ephemeral: false,
    extension_group_id: None,
    proxy_bypass_rules: Vec::new(),
    created_by_id: None,
    created_by_email: None,
    dns_blocklist: None,
    password_protected: false,
    created_at: None,
    updated_at: None,
  };

  if browser == "camoufox" {
    let config: crate::camoufox_manager::CamoufoxConfig =
      serde_json::from_str(&config_json).map_err(|e| format!("Failed to parse config: {e}"))?;
    let manager = crate::camoufox_manager::CamoufoxManager::instance();
    manager
      .generate_fingerprint_config(&app_handle, &temp_profile, &config)
      .await
      .map_err(|e| format!("Failed to generate fingerprint: {e}"))
  } else if browser == "wayfern" {
    let config: crate::wayfern_manager::WayfernConfig =
      serde_json::from_str(&config_json).map_err(|e| format!("Failed to parse config: {e}"))?;
    let manager = crate::wayfern_manager::WayfernManager::instance();
    manager
      .generate_fingerprint_config(&app_handle, &temp_profile, &config)
      .await
      .map_err(|e| format!("Failed to generate fingerprint: {e}"))
  } else {
    Err(format!(
      "Unsupported browser for fingerprint generation: {browser}"
    ))
  }
}

/// Confirm a quit chosen from the close-confirmation dialog and exit the app.
#[tauri::command]
fn confirm_quit(app_handle: tauri::AppHandle) {
  QUIT_CONFIRMED.store(true, Ordering::SeqCst);
  app_handle.exit(0);
}

/// Hide the main window so the app keeps running behind its tray icon.
#[tauri::command]
fn hide_to_tray(app_handle: tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app_handle.get_webview_window("main") {
    window.hide().map_err(|e| e.to_string())?;
  }
  Ok(())
}

fn show_main_window(app_handle: &tauri::AppHandle) {
  if let Some(window) = app_handle.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

/// Update the tray menu labels with localized strings pushed from the frontend
/// (which owns the active language). The item ids are unchanged so the existing
/// menu-event handler keeps matching.
#[tauri::command]
fn update_tray_menu(
  app_handle: tauri::AppHandle,
  show_label: String,
  quit_label: String,
) -> Result<(), String> {
  use tauri::menu::{MenuBuilder, MenuItemBuilder};
  if let Some(tray) = app_handle.tray_by_id("main") {
    let show_item = MenuItemBuilder::with_id("tray_show", show_label)
      .build(&app_handle)
      .map_err(|e| e.to_string())?;
    let quit_item = MenuItemBuilder::with_id("tray_quit", quit_label)
      .build(&app_handle)
      .map_err(|e| e.to_string())?;
    let menu = MenuBuilder::new(&app_handle)
      .item(&show_item)
      .separator()
      .item(&quit_item)
      .build()
      .map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
  }
  Ok(())
}

/// Build the system tray. Best-effort: on Linux the tray depends on
/// libayatana-appindicator at runtime, so any failure here must not abort app
/// startup — the caller logs and continues without a tray.
fn setup_system_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  use std::sync::atomic::Ordering;
  use tauri::menu::{MenuBuilder, MenuItemBuilder};
  use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

  // Bootstrap labels only — the frontend pushes localized labels via
  // `update_tray_menu` on mount and on language change, and the menu is only
  // opened after a minimize-to-tray (post-mount), so these are never shown.
  let show_item = MenuItemBuilder::with_id("tray_show", "Show Donut Browser").build(app)?;
  let quit_item = MenuItemBuilder::with_id("tray_quit", "Quit").build(app)?;
  let tray_menu = MenuBuilder::new(app)
    .item(&show_item)
    .separator()
    .item(&quit_item)
    .build()?;

  // macOS uses a black template icon (the OS tints it for light/dark menu
  // bars). Windows and Linux use the full-color icon, because neither tints a
  // template — a black template would be invisible on dark Linux panels.
  #[cfg(target_os = "macos")]
  let tray_icon_bytes: &[u8] = include_bytes!("../icons/tray-icon-44.png");
  #[cfg(not(target_os = "macos"))]
  let tray_icon_bytes: &[u8] = include_bytes!("../icons/tray-icon-win-44.png");
  let tray_rgba = image::load_from_memory(tray_icon_bytes)?.into_rgba8();
  let (tray_w, tray_h) = tray_rgba.dimensions();
  let tray_image = tauri::image::Image::new_owned(tray_rgba.into_raw(), tray_w, tray_h);

  TrayIconBuilder::with_id("main")
    .icon(tray_image)
    .icon_as_template(cfg!(target_os = "macos"))
    .tooltip("Donut Browser")
    .menu(&tray_menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app_handle, event| match event.id().as_ref() {
      "tray_show" => show_main_window(app_handle),
      "tray_quit" => {
        QUIT_CONFIRMED.store(true, Ordering::SeqCst);
        app_handle.exit(0);
      }
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      // Click events are not delivered on Linux (AppIndicator/SNI only drives
      // the menu), so left-click-to-restore is macOS/Windows only — Linux users
      // restore via the "Show Donut Browser" menu item.
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        show_main_window(tray.app_handle());
      }
    })
    .build(app)?;

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let args: Vec<String> = env::args().collect();
  let startup_url = args.iter().find(|arg| arg.starts_with("http")).cloned();

  if let Some(url) = startup_url.clone() {
    log::info!("Found startup URL in command line: {url}");
    let mut pending = PENDING_URLS.lock().unwrap();
    pending.push(url.clone());
  }

  let log_file_name = app_dirs::app_name();

  // Honor DONUTBROWSER_DATA_ROOT: when set, logs go to <root>/logs instead of
  // the platform default app log dir, so all on-disk state lives under one root.
  let file_log_target = match app_dirs::log_dir_override() {
    Some(path) => Target::new(TargetKind::Folder {
      path,
      file_name: Some(log_file_name.to_string()),
    }),
    None => Target::new(TargetKind::LogDir {
      file_name: Some(log_file_name.to_string()),
    }),
  };

  tauri::Builder::default()
    .plugin(
      tauri_plugin_log::Builder::new()
        .clear_targets() // Clear default targets to avoid duplicates
        .target(Target::new(TargetKind::Stdout))
        .target(Target::new(TargetKind::Webview))
        .target(file_log_target)
        // 5 MB per rotated file × KeepAll — the previous 100 KB limit
        // truncated useful context in customer support reports; 50 MB
        // turned out to be excessive disk pressure.
        .max_file_size(5 * 1024 * 1024)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
        .level(log::LevelFilter::Info)
        .format(|out, message, record| {
          use chrono::Local;
          let now = Local::now();
          let timestamp = format!(
            "{}.{:03}",
            now.format("%Y-%m-%d %H:%M:%S"),
            now.timestamp_subsec_millis()
          );
          out.finish(format_args!(
            "[{}][{}][{}] {}",
            timestamp,
            record.target(),
            record.level(),
            message
          ))
        })
        .build(),
    )
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
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_macos_permissions::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(
      WindowStateBuilder::default()
        .with_state_flags(StateFlags::all().difference(StateFlags::VISIBLE | StateFlags::FULLSCREEN))
        .build(),
    )
    .setup(|app| {
      // Recover ephemeral dir mappings from RAM-backed storage (tmpfs/ramdisk)
      ephemeral_dirs::recover_ephemeral_dirs();

      // Extract icons and metadata for existing extensions that don't have them yet
      {
        let mgr = extension_manager::ExtensionManager::new();
        mgr.ensure_icons_extracted();
      }

      // Create the main window programmatically
      #[allow(unused_variables)]
      let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Donut Browser")
        .inner_size(880.0, 500.0)
        .min_inner_size(640.0, 400.0)
        .resizable(true)
        .fullscreen(false)
        .center()
        .focused(true)
        .visible(true);

      #[cfg(target_os = "windows")]
      let win_builder = win_builder.decorations(false);

      #[allow(unused_variables)]
      let window = win_builder.build().unwrap();

      // System tray so the user can keep the app running after the close
      // dialog's "Minimize" action hides the window. Best-effort: a tray
      // failure (e.g. missing libayatana-appindicator on Linux) must never
      // prevent the app from launching, so we log and continue without it.
      if let Err(e) = setup_system_tray(app.handle()) {
        log::warn!("System tray unavailable, continuing without it: {e}");
      }

      // Intercept the window close so the frontend can ask the user whether
      // to minimize or quit. The app exits when `confirm_quit` flips
      // QUIT_CONFIRMED — until then, every CloseRequested is held back.
      {
        let app_handle = app.handle().clone();
        window.on_window_event(move |event| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if QUIT_CONFIRMED.load(Ordering::SeqCst) {
              return;
            }
            api.prevent_close();
            if let Err(e) = app_handle.emit("close-confirm-requested", ()) {
              log::warn!("Failed to emit close-confirm-requested: {e}");
            }
          }
        });
      }

      // Set transparent titlebar for macOS
      #[cfg(target_os = "macos")]
      {
        if let Err(e) = window.set_transparent_titlebar(true) {
          log::warn!("Failed to set transparent titlebar: {e}");
        }
        if let Err(e) = window.disable_native_fullscreen() {
          log::warn!("Failed to disable native fullscreen: {e}");
        }
      }

      // Set up deep link handler
      let handle = app.handle().clone();

      // Initialize the global event emitter for the events module
      let emitter = std::sync::Arc::new(events::TauriEmitter::new(handle.clone()));
      if let Err(e) = events::set_global_emitter(emitter) {
        log::warn!("Failed to set global event emitter: {e}");
      }

      #[cfg(windows)]
      {
        // For Windows, register all deep links at runtime
        if let Err(e) = app.deep_link().register_all() {
          log::warn!("Failed to register deep links: {e}");
        }
      }

      #[cfg(target_os = "macos")]
      {
        // On macOS, try to register deep links for development builds
        if let Err(e) = app.deep_link().register_all() {
          log::debug!(
            "Note: Deep link registration failed on macOS (this is normal for production): {e}"
          );
        }
      }

      app.deep_link().on_open_url({
        let handle = handle.clone();
        move |event| {
          let urls = event.urls();
          log::info!("Deep link event received with {} URLs", urls.len());

          for url in urls {
            let url_string = url.to_string();
            log::info!("Deep link received: {url_string}");

            // Clone the handle for each async task
            let handle_clone = handle.clone();

            // Handle the URL asynchronously
            tauri::async_runtime::spawn(async move {
              if let Err(e) = handle_url_open(handle_clone, url_string.clone()).await {
                log::error!("Failed to handle deep link URL: {e}");
              }
            });
          }
        }
      });

      if let Some(startup_url) = startup_url {
        let handle_clone = handle.clone();
        tauri::async_runtime::spawn(async move {
          log::info!("Processing startup URL from command line: {startup_url}");
          if let Err(e) = handle_url_open(handle_clone, startup_url.clone()).await {
            log::error!("Failed to handle startup URL: {e}");
          }
        });
      }

      // Initialize and start background version updater
      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let version_updater = get_version_updater();

        // Set the app handle
        {
          let mut updater_guard = version_updater.lock().await;
          updater_guard.set_app_handle(app_handle);
        }

        // Run startup check without holding the lock
        {
          let updater_guard = version_updater.lock().await;
          if let Err(e) = updater_guard.start_background_updates().await {
            log::error!("Failed to start background updates: {e}");
          }
        }
      });

      // Start the background update task separately
      tauri::async_runtime::spawn(async move {
        version_updater::VersionUpdater::run_background_task().await;
      });

      // Clear stale process IDs from profiles (processes that died while app was closed)
      {
        let profile_manager = crate::profile::ProfileManager::instance();
        if let Ok(profiles) = profile_manager.list_profiles() {
          let system = sysinfo::System::new_with_specifics(
            sysinfo::RefreshKind::nothing()
              .with_processes(sysinfo::ProcessRefreshKind::everything()),
          );
          for profile in profiles {
            if let Some(pid) = profile.process_id {
              let sysinfo_pid = sysinfo::Pid::from_u32(pid);
              if system.process(sysinfo_pid).is_none() {
                log::info!(
                  "Clearing stale process_id {} for profile {}",
                  pid,
                  profile.name
                );
                let mut updated = profile.clone();
                updated.process_id = None;
                let _ = profile_manager.save_profile(&updated);
              }
            }
          }
        }
      }

      // Immediately bump non-running profiles to the latest installed browser version.
      // This runs synchronously before any network calls so profiles are updated on launch.
      {
        let app_handle_bump = app.handle().clone();
        match auto_updater::AutoUpdater::instance()
          .update_profiles_to_latest_installed(&app_handle_bump)
        {
          Ok(updated) => {
            if !updated.is_empty() {
              log::info!(
                "Startup: bumped {} profiles to latest installed versions: {:?}",
                updated.len(),
                updated
              );
            }
          }
          Err(e) => {
            log::error!("Startup: failed to bump profiles to latest installed versions: {e}");
          }
        }
      }

      let app_handle_auto_updater = app.handle().clone();

      // Start the auto-update check task separately
      tauri::async_runtime::spawn(async move {
        auto_updater::check_for_updates_with_progress(app_handle_auto_updater).await;
      });

      // Handle any pending URLs that were received before the window was ready
      let handle_pending = handle.clone();
      tauri::async_runtime::spawn(async move {
        // Wait a bit for the window to be fully ready
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

        let pending_urls = {
          let mut pending = PENDING_URLS.lock().unwrap();
          let urls = pending.clone();
          pending.clear();
          urls
        };

        for url in pending_urls {
          log::info!("Processing pending URL: {url}");
          if let Err(e) = handle_url_open(handle_pending.clone(), url).await {
            log::error!("Failed to handle pending URL: {e}");
          }
        }
      });

      // Start periodic cleanup task for unused binaries
      // Only runs when sync is not in progress to avoid deleting browsers
      // that might be needed for profiles being synced from the cloud
      tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(43200)); // Every 12 hours

        loop {
          interval.tick().await;

          let registry =
            crate::downloaded_browsers_registry::DownloadedBrowsersRegistry::instance();
          if let Err(e) = registry.cleanup_unused_binaries() {
            log::error!("Periodic cleanup failed: {e}");
          } else {
            log::debug!("Periodic cleanup completed successfully");
          }
        }
      });

      // DNS blocklist refresh task (every 12 hours)
      tauri::async_runtime::spawn(async move {
        let manager = dns_blocklist::BlocklistManager::instance();
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(43200));
        interval.tick().await; // Skip the immediate first tick
        loop {
          interval.tick().await;
          manager.refresh_all_stale().await;
        }
      });

      tauri::async_runtime::spawn(async move {
        let updater = app_auto_updater::AppAutoUpdater::instance();
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(3 * 60 * 60));

        loop {
          interval.tick().await;

          log::info!("Checking for app updates...");
          match updater.check_for_updates().await {
            Ok(Some(update_info)) => {
              log::info!(
                "App update available: {} -> {}",
                update_info.current_version,
                update_info.new_version
              );
              if let Err(e) = events::emit("app-update-available", &update_info) {
                log::error!("Failed to emit app update event: {e}");
              }
            }
            Ok(None) => {
              log::debug!("No app updates available");
            }
            Err(e) => {
              log::error!("Failed to check for app updates: {e}");
            }
          }
        }
      });

      // Start Camoufox cleanup task
      let _app_handle_cleanup = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let camoufox_manager = crate::camoufox_manager::CamoufoxManager::instance();
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));

        loop {
          interval.tick().await;

          match camoufox_manager.cleanup_dead_instances().await {
            Ok(_) => {
              // Cleanup completed silently
            }
            Err(e) => {
              log::error!("Error during Camoufox cleanup: {e}");
            }
          }
        }
      });

      // Check and download GeoIP database at startup if needed
      let app_handle_geoip = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        // Wait a bit for the app to fully initialize
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        let geoip_downloader = crate::geoip_downloader::GeoIPDownloader::instance();
        match geoip_downloader.check_missing_geoip_database() {
          Ok(true) => {
            log::info!(
              "GeoIP database is missing for Camoufox profiles, downloading at startup..."
            );
            let geoip_downloader = GeoIPDownloader::instance();
            if let Err(e) = geoip_downloader
              .download_geoip_database(&app_handle_geoip)
              .await
            {
              log::error!("Failed to download GeoIP database at startup: {e}");
            } else {
              log::info!("GeoIP database downloaded successfully at startup");
            }
          }
          Ok(false) => {
            // No Camoufox profiles or GeoIP database already available
          }
          Err(e) => {
            log::error!("Failed to check GeoIP database status at startup: {e}");
          }
        }
      });

      // Start proxy cleanup task for dead browser processes
      let app_handle_proxy_cleanup = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

        loop {
          interval.tick().await;

          match crate::proxy_manager::PROXY_MANAGER
            .cleanup_dead_proxies(app_handle_proxy_cleanup.clone())
            .await
          {
            Ok(dead_pids) => {
              if !dead_pids.is_empty() {
                log::info!(
                  "Cleaned up proxies for {} dead browser processes",
                  dead_pids.len()
                );
              }
            }
            Err(e) => {
              log::error!("Error during proxy cleanup: {e}");
            }
          }
        }
      });

      // Periodically broadcast browser running status to the frontend.
      // When no profiles have stored PIDs (nothing was ever launched this
      // session), we use a long interval (30s) to avoid burning CPU on
      // full process-table scans via sysinfo. Once any profile is running
      // we switch to the fast interval (5s) for responsive UI updates.
      let app_handle_status = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        const FAST_INTERVAL_SECS: u64 = 5;
        const IDLE_INTERVAL_SECS: u64 = 30;

        let mut interval =
          tokio::time::interval(tokio::time::Duration::from_secs(FAST_INTERVAL_SECS));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut last_running_states: std::collections::HashMap<String, bool> =
          std::collections::HashMap::new();
        let mut current_interval_secs = FAST_INTERVAL_SECS;

        loop {
          interval.tick().await;

          let runner = crate::browser_runner::BrowserRunner::instance();
          let profiles = match runner.profile_manager.list_profiles() {
            Ok(p) => p,
            Err(e) => {
              log::warn!("Failed to list profiles in status checker: {e}");
              continue;
            }
          };

          // If no profile has a stored PID and we have no previously-known
          // running states, there's nothing to check — skip the expensive
          // process scan entirely.
          let any_has_pid = profiles.iter().any(|p| p.process_id.is_some());
          let any_was_running = last_running_states.values().any(|&v| v);

          if !any_has_pid && !any_was_running {
            // Switch to the idle interval to reduce CPU
            if current_interval_secs != IDLE_INTERVAL_SECS {
              current_interval_secs = IDLE_INTERVAL_SECS;
              interval =
                tokio::time::interval(tokio::time::Duration::from_secs(IDLE_INTERVAL_SECS));
              interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            }
            continue;
          }

          // At least one profile might be running — use the fast interval
          if current_interval_secs != FAST_INTERVAL_SECS {
            current_interval_secs = FAST_INTERVAL_SECS;
            interval = tokio::time::interval(tokio::time::Duration::from_secs(FAST_INTERVAL_SECS));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
          }

          // Only walk profiles that either have a stored PID or that we last
          // saw as running — for users with hundreds of idle profiles this
          // turns an O(N) sysinfo scan into an O(running) scan. The Rust
          // launch path always emits profile-running-changed when a profile
          // STARTS, so newly-running profiles still get tracked here.
          let profiles_to_check: Vec<_> = profiles
            .into_iter()
            .filter(|p| {
              p.process_id.is_some()
                || last_running_states
                  .get(&p.id.to_string())
                  .copied()
                  .unwrap_or(false)
            })
            .collect();

          for profile in profiles_to_check {
            // Check browser status and track changes
            match runner
              .check_browser_status(app_handle_status.clone(), &profile)
              .await
            {
              Ok(is_running) => {
                let profile_id = profile.id.to_string();
                let last_state = last_running_states
                  .get(&profile_id)
                  .copied()
                  .unwrap_or(false);

                // Only emit event if state actually changed
                if last_state != is_running {
                  log::debug!(
                    "Status checker detected change for profile {}: {} -> {}",
                    profile.name,
                    last_state,
                    is_running
                  );

                  #[derive(serde::Serialize)]
                  struct RunningChangedPayload {
                    id: String,
                    is_running: bool,
                  }

                  let payload = RunningChangedPayload {
                    id: profile_id.clone(),
                    is_running,
                  };

                  if let Err(e) = events::emit("profile-running-changed", &payload) {
                    log::warn!("Failed to emit profile running changed event: {e}");
                  } else {
                    log::debug!(
                      "Status checker emitted profile-running-changed event for {}: running={}",
                      profile.name,
                      is_running
                    );
                  }

                  // Re-encrypt password-protected profiles when the browser
                  // exits naturally (user closing the window) — the explicit
                  // kill path in browser_runner.rs handles app-driven stops.
                  // Must run BEFORE `mark_profile_stopped` because that
                  // releases any queued sync run, and a sync that picks up
                  // the on-disk dir before re-encryption finishes uploads
                  // the previous snapshot (issue: encrypted profiles not
                  // syncing fresh data).
                  if !is_running && profile.password_protected {
                    crate::profile::password::complete_after_quit_and_wait(&profile)
                      .await;
                  }

                  last_running_states.insert(profile_id, is_running);
                } else {
                  // Update the state even if unchanged to ensure we have it tracked
                  last_running_states.insert(profile_id, is_running);
                }
              }
              Err(e) => {
                log::warn!("Status check failed for profile {}: {}", profile.name, e);
                continue;
              }
            }
          }
        }
      });

      // Nodecar warm-up is now triggered from the frontend to allow UI blocking overlay

      // Start API server if enabled in settings
      let app_handle_api = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        match crate::settings_manager::get_app_settings(app_handle_api.clone()).await {
          Ok(settings) => {
            if settings.api_enabled {
              log::info!("API is enabled in settings, starting API server...");
              match crate::api_server::start_api_server_internal(settings.api_port, &app_handle_api)
                .await
              {
                Ok(port) => {
                  log::info!("API server started successfully on port {port}");
                  // Emit success toast to frontend
                  if let Err(e) = events::emit(
                    "show-toast",
                    crate::api_server::ToastPayload {
                      message: "API server started successfully".to_string(),
                      variant: "success".to_string(),
                      title: "Local API Started".to_string(),
                      description: Some(format!("API server running on port {port}")),
                    },
                  ) {
                    log::error!("Failed to emit API start toast: {e}");
                  }
                }
                Err(e) => {
                  log::error!("Failed to start API server at startup: {e}");
                  // Emit error toast to frontend
                  if let Err(toast_err) = events::emit(
                    "show-toast",
                    crate::api_server::ToastPayload {
                      message: "Failed to start API server".to_string(),
                      variant: "error".to_string(),
                      title: "Failed to Start Local API".to_string(),
                      description: Some(format!("Error: {e}")),
                    },
                  ) {
                    log::error!("Failed to emit API error toast: {toast_err}");
                  }
                }
              }
            }
          }
          Err(e) => {
            log::error!("Failed to load app settings for API startup: {e}");
          }
        }
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      confirm_quit,
      hide_to_tray,
      update_tray_menu,
      get_supported_browsers,
      is_browser_supported_on_platform,
      download_browser,
      cancel_download,
      delete_profile,
      clone_profile,
      check_browser_exists,
      create_browser_profile_new,
      create_browser_profiles_bulk,
      list_browser_profiles,
      launch_browser_profile,
      fetch_browser_versions_with_count,
      fetch_browser_versions_cached_first,
      fetch_browser_versions_with_count_cached_first,
      get_downloaded_browser_versions,
      get_all_tags,
      get_browser_release_types,
      update_profile_proxy,
      update_profile_tags,
      update_profile_note,
      update_profile_launch_hook,
      update_profile_proxy_bypass_rules,
      update_profile_dns_blocklist,
      check_browser_status,
      kill_browser_profile,
      rename_profile,
      get_app_settings,
      save_app_settings,
      get_data_dir_settings,
      save_data_dir_settings,
      read_log_files,
      open_log_directory,
      get_table_sorting_settings,
      save_table_sorting_settings,
      get_system_language,
      get_system_info,
      dismiss_window_resize_warning,
      get_window_resize_warning_dismissed,
      get_onboarding_completed,
      complete_onboarding,
      clear_all_version_cache_and_refetch,
      is_default_browser,
      open_url_with_profile,
      set_as_default_browser,
      trigger_manual_version_update,
      get_version_update_status,
      check_for_browser_updates,
      dismiss_update_notification,
      complete_browser_update_with_auto_update,
      check_for_app_updates,
      check_for_app_updates_manual,
      download_and_prepare_app_update,
      restart_application,
      detect_existing_profiles,
      import_browser_profile,
      check_missing_binaries,
      check_missing_geoip_database,
      ensure_all_binaries_exist,
      ensure_active_browsers_downloaded,
      update_camoufox_config,
      update_wayfern_config,
      generate_sample_fingerprint,
      get_profile_groups,
      get_groups_with_profile_counts,
      create_profile_group,
      update_profile_group,
      delete_profile_group,
      assign_profiles_to_group,
      delete_selected_profiles,
      list_extensions,
      get_extension_icon,
      add_extension,
      update_extension,
      delete_extension,
      list_extension_groups,
      create_extension_group,
      update_extension_group,
      delete_extension_group,
      add_extension_to_group,
      remove_extension_from_group,
      assign_extension_group_to_profile,
      get_extension_group_for_profile,
      is_geoip_database_available,
      download_geoip_database,
      start_api_server,
      stop_api_server,
      get_api_server_status,
      get_all_traffic_snapshots,
      get_profile_traffic_snapshot,
      clear_all_traffic_stats,
      get_traffic_stats_for_period,
      read_profile_cookies,
      get_profile_cookie_stats,
      copy_profile_cookies,
      import_cookies_from_file,
      export_profile_cookies,
      check_wayfern_terms_accepted,
      check_wayfern_downloaded,
      accept_wayfern_terms,
      get_commercial_trial_status,
      acknowledge_trial_expiration,
      has_acknowledged_trial_expiration,
      // DNS blocklist commands
      dns_blocklist::get_dns_blocklist_cache_status,
      dns_blocklist::refresh_dns_blocklists,
      // Profile password commands
      set_profile_password,
      change_profile_password,
      remove_profile_password,
      verify_profile_password,
      unlock_profile,
      lock_profile,
      is_profile_locked,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
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
}

#[cfg(test)]
mod tests {
  use std::fs;

  #[test]
  fn test_no_unused_tauri_commands() {
    check_unused_commands(false); // Run in strict mode for CI
  }

  #[test]
  fn test_unused_tauri_commands_detailed() {
    check_unused_commands(true); // Run in verbose mode for development
  }

  fn check_unused_commands(verbose: bool) {
    // Commands that are intentionally not used in the frontend
    // but are used via other programmatic APIs or are intentionally excluded.
    let ignored_commands = [
      "export_profile_cookies",
      "update_extension",
      "generate_sample_fingerprint",
      "lock_profile",
    ];

    // Extract command names from the generate_handler! macro in this file
    let lib_rs_content = fs::read_to_string("src/lib.rs").expect("Failed to read lib.rs");
    let commands = extract_tauri_commands(&lib_rs_content);

    // Get all frontend files
    let frontend_files = get_frontend_files("../src");

    // Check which commands are actually used
    let mut unused_commands = Vec::new();
    let mut used_commands = Vec::new();

    for command in &commands {
      // Skip commands that are intentionally not used in the frontend
      if ignored_commands.contains(&command.as_str()) {
        used_commands.push(command.clone());
        if verbose {
          println!("✅ {command} (ignored)");
        }
        continue;
      }

      let mut is_used = false;

      for file_content in &frontend_files {
        // More comprehensive search for command usage
        if is_command_used(file_content, command) {
          is_used = true;
          break;
        }
      }

      if is_used {
        used_commands.push(command.clone());
        if verbose {
          println!("✅ {command}");
        }
      } else {
        unused_commands.push(command.clone());
        if verbose {
          println!("❌ {command} (UNUSED)");
        }
      }
    }

    if verbose {
      println!("\n📊 Summary:");
      println!("  ✅ Used commands: {}", used_commands.len());
      println!("  ❌ Unused commands: {}", unused_commands.len());
    }

    if !unused_commands.is_empty() {
      let message = format!(
        "Found {} unused Tauri commands: {}\n\nThese commands are exported in generate_handler! but not used in the frontend.\nConsider removing them or add them to the allowlist if they're used elsewhere.\n\nRun `pnpm check-unused-commands` for detailed analysis.",
        unused_commands.len(),
        unused_commands.join(", ")
      );

      if verbose {
        println!("\n🚨 {message}");
      } else {
        panic!("{}", message);
      }
    } else if verbose {
      println!("\n🎉 All exported commands are being used!");
    } else {
      println!(
        "✅ All {} exported Tauri commands are being used in the frontend",
        commands.len()
      );
    }
  }

  fn is_command_used(content: &str, command: &str) -> bool {
    // Check various patterns for invoke usage
    let patterns = vec![
      format!("invoke<{}>(\"{}\"", "", command), // invoke<Type>("command"
      format!("invoke(\"{}\"", command),         // invoke("command"
      format!("invoke<{}>(\"{}\",", "", command), // invoke<Type>("command",
      format!("invoke(\"{}\",", command),        // invoke("command",
      format!("\"{}\"", command),                // Just the command name in quotes
    ];

    for pattern in patterns {
      if content.contains(&pattern) {
        return true;
      }
    }

    // Also check for the command name appearing after "invoke" within a reasonable distance
    if let Some(invoke_pos) = content.find("invoke") {
      let after_invoke = &content[invoke_pos..];
      if let Some(cmd_pos) = after_invoke.find(&format!("\"{command}\"")) {
        // If the command appears within 100 characters of "invoke", consider it used
        if cmd_pos < 100 {
          return true;
        }
      }
    }

    false
  }

  fn extract_tauri_commands(content: &str) -> Vec<String> {
    let mut commands = Vec::new();

    // Find the generate_handler! macro
    if let Some(start) = content.find("tauri::generate_handler![") {
      if let Some(end) = content[start..].find("])") {
        let handler_content = &content[start + 25..start + end]; // Skip "tauri::generate_handler!["

        // Extract command names
        for line in handler_content.lines() {
          let line = line.trim();
          if !line.is_empty() && !line.starts_with("//") {
            // Remove trailing comma and whitespace
            let command = line.trim_end_matches(',').trim();
            if !command.is_empty() {
              // Strip module prefix (e.g., "cloud_auth::cloud_get_user" -> "cloud_get_user")
              let command = command.rsplit("::").next().unwrap_or(command);
              commands.push(command.to_string());
            }
          }
        }
      }
    }

    commands
  }

  fn get_frontend_files(src_dir: &str) -> Vec<String> {
    let mut files_content = Vec::new();

    if let Ok(entries) = fs::read_dir(src_dir) {
      for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
          // Recursively read subdirectories
          let subdir_files = get_frontend_files(&path.to_string_lossy());
          files_content.extend(subdir_files);
        } else if let Some(extension) = path.extension() {
          if matches!(
            extension.to_str(),
            Some("ts") | Some("tsx") | Some("js") | Some("jsx")
          ) {
            if let Ok(content) = fs::read_to_string(&path) {
              files_content.push(content);
            }
          }
        }
      }
    }

    files_content
  }
}
