use crate::profile::BrowserProfile;
use std::path::{Path, PathBuf};
use tokio::time::{sleep, Duration};

const CHROMIUM_CACHE_DIRS: &[&str] = &[
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "DawnWebGPUCache",
  "DawnGraphiteCache",
  "GraphiteDawnCache",
  "GrShaderCache",
  "ShaderCache",
  "BrowserMetrics",
  "component_crx_cache",
  "extensions_crx_cache",
  "Default/Cache",
  "Default/Code Cache",
  "Default/GPUCache",
  "Default/DawnCache",
  "Default/DawnWebGPUCache",
  "Default/DawnGraphiteCache",
  "Default/GraphiteDawnCache",
  "Default/GrShaderCache",
  "Default/ShaderCache",
  "Default/Service Worker/ScriptCache",
];

const CAMOUFOX_CACHE_DIRS: &[&str] = &[
  "cache2",
  "startupCache",
  "thumbnails",
  "shader-cache",
  "jumpListCache",
  "OfflineCache",
];

pub async fn clear_profile_cache_after_close(profile: &BrowserProfile) {
  let enabled = crate::settings_manager::SettingsManager::instance()
    .load_settings()
    .map(|settings| settings.clear_cache_after_browser_close)
    .unwrap_or(true);

  if !enabled {
    return;
  }

  let profiles_dir = crate::profile::manager::ProfileManager::instance().get_profiles_dir();
  let profile_path = crate::ephemeral_dirs::get_effective_profile_path(profile, &profiles_dir);
  clear_profile_cache_dirs(profile.browser.as_str(), &profile_path).await;
}

async fn clear_profile_cache_dirs(browser: &str, profile_path: &Path) {
  if !profile_path.exists() {
    return;
  }

  let cache_dirs = match browser {
    "wayfern" | "cloak" => CHROMIUM_CACHE_DIRS,
    "camoufox" => CAMOUFOX_CACHE_DIRS,
    _ => return,
  };

  for rel in cache_dirs {
    remove_cache_dir_with_retry(profile_path.join(rel)).await;
  }
}

async fn remove_cache_dir_with_retry(path: PathBuf) {
  for attempt in 1..=3 {
    match tokio::fs::remove_dir_all(&path).await {
      Ok(()) => {
        log::info!("Cleared browser cache directory: {}", path.display());
        return;
      }
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => return,
      Err(e) if attempt < 3 => {
        log::debug!(
          "Failed to clear browser cache directory {} on attempt {}: {}",
          path.display(),
          attempt,
          e
        );
        sleep(Duration::from_millis(200)).await;
      }
      Err(e) => {
        log::warn!(
          "Failed to clear browser cache directory {} after {} attempts: {}",
          path.display(),
          attempt,
          e
        );
        return;
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::TempDir;

  fn write_file(path: &Path) {
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, b"data").unwrap();
  }

  #[tokio::test]
  async fn wayfern_cleanup_removes_cache_and_preserves_session_data() {
    let temp = TempDir::new().unwrap();
    let profile = temp.path();

    write_file(&profile.join("Default/Cache/data_0"));
    write_file(&profile.join("Default/Code Cache/js/index"));
    write_file(&profile.join("Default/GPUCache/data"));
    write_file(&profile.join("Default/DawnWebGPUCache/data"));
    write_file(&profile.join("Default/DawnGraphiteCache/data"));
    write_file(&profile.join("Default/Service Worker/ScriptCache/data"));
    write_file(&profile.join("BrowserMetrics/data"));
    write_file(&profile.join("GraphiteDawnCache/data"));
    write_file(&profile.join("Default/Service Worker/CacheStorage/cache/index"));
    write_file(&profile.join("Default/Cookies"));
    write_file(&profile.join("Default/Local Storage/leveldb/000003.log"));
    write_file(&profile.join("Default/Session Storage/000003.log"));
    write_file(&profile.join("Default/IndexedDB/site.leveldb/000003.log"));

    clear_profile_cache_dirs("wayfern", profile).await;

    assert!(!profile.join("Default/Cache").exists());
    assert!(!profile.join("Default/Code Cache").exists());
    assert!(!profile.join("Default/GPUCache").exists());
    assert!(!profile.join("Default/DawnWebGPUCache").exists());
    assert!(!profile.join("Default/DawnGraphiteCache").exists());
    assert!(!profile.join("Default/Service Worker/ScriptCache").exists());
    assert!(!profile.join("BrowserMetrics").exists());
    assert!(!profile.join("GraphiteDawnCache").exists());
    assert!(profile.join("Default/Cookies").exists());
    assert!(profile
      .join("Default/Local Storage/leveldb/000003.log")
      .exists());
    assert!(profile.join("Default/Session Storage/000003.log").exists());
    assert!(profile
      .join("Default/IndexedDB/site.leveldb/000003.log")
      .exists());
    assert!(profile
      .join("Default/Service Worker/CacheStorage/cache/index")
      .exists());
  }

  #[tokio::test]
  async fn cloak_cleanup_removes_chromium_cache_and_preserves_session_data() {
    let temp = TempDir::new().unwrap();
    let profile = temp.path();

    write_file(&profile.join("Default/Cache/Cache_Data/data_0"));
    write_file(&profile.join("Default/Code Cache/js/index"));
    write_file(&profile.join("Default/GPUCache/data"));
    write_file(&profile.join("Default/DawnWebGPUCache/data"));
    write_file(&profile.join("Default/DawnGraphiteCache/data"));
    write_file(&profile.join("Default/Service Worker/ScriptCache/data"));
    write_file(&profile.join("BrowserMetrics/metrics.pma"));
    write_file(&profile.join("GraphiteDawnCache/data"));
    write_file(&profile.join("GrShaderCache/data"));
    write_file(&profile.join("ShaderCache/data"));
    write_file(&profile.join("Default/Cookies"));
    write_file(&profile.join("Default/Local Storage/leveldb/000003.log"));
    write_file(&profile.join("Default/Session Storage/000003.log"));
    write_file(&profile.join("Default/IndexedDB/site.leveldb/000003.log"));
    write_file(&profile.join("Default/Sessions/Session_1"));

    clear_profile_cache_dirs("cloak", profile).await;

    assert!(!profile.join("Default/Cache").exists());
    assert!(!profile.join("Default/Code Cache").exists());
    assert!(!profile.join("Default/GPUCache").exists());
    assert!(!profile.join("Default/DawnWebGPUCache").exists());
    assert!(!profile.join("Default/DawnGraphiteCache").exists());
    assert!(!profile.join("Default/Service Worker/ScriptCache").exists());
    assert!(!profile.join("BrowserMetrics").exists());
    assert!(!profile.join("GraphiteDawnCache").exists());
    assert!(!profile.join("GrShaderCache").exists());
    assert!(!profile.join("ShaderCache").exists());
    assert!(profile.join("Default/Cookies").exists());
    assert!(profile
      .join("Default/Local Storage/leveldb/000003.log")
      .exists());
    assert!(profile.join("Default/Session Storage/000003.log").exists());
    assert!(profile
      .join("Default/IndexedDB/site.leveldb/000003.log")
      .exists());
    assert!(profile.join("Default/Sessions/Session_1").exists());
  }

  #[tokio::test]
  async fn camoufox_cleanup_removes_cache_and_preserves_session_data() {
    let temp = TempDir::new().unwrap();
    let profile = temp.path();

    write_file(&profile.join("cache2/entries/data"));
    write_file(&profile.join("startupCache/startup"));
    write_file(&profile.join("cookies.sqlite"));
    write_file(&profile.join("storage/default/site/ls/data.sqlite"));
    write_file(&profile.join("sessionstore.jsonlz4"));
    write_file(&profile.join("logins.json"));
    write_file(&profile.join("key4.db"));

    clear_profile_cache_dirs("camoufox", profile).await;

    assert!(!profile.join("cache2").exists());
    assert!(!profile.join("startupCache").exists());
    assert!(profile.join("cookies.sqlite").exists());
    assert!(profile.join("storage/default/site/ls/data.sqlite").exists());
    assert!(profile.join("sessionstore.jsonlz4").exists());
    assert!(profile.join("logins.json").exists());
    assert!(profile.join("key4.db").exists());
  }
}
