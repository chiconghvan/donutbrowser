use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;

// cloud_auth module removed; team lock functionality disabled

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileLockInfo {
  #[serde(rename = "profileId")]
  pub profile_id: String,
  #[serde(rename = "lockedBy")]
  pub locked_by: String,
  #[serde(rename = "lockedByEmail")]
  pub locked_by_email: String,
  #[serde(rename = "lockedAt")]
  pub locked_at: String,
  #[serde(rename = "expiresAt", default)]
  pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AcquireLockResponse {
  success: bool,
  #[serde(rename = "lockedBy")]
  locked_by: Option<String>,
  #[serde(rename = "lockedByEmail")]
  locked_by_email: Option<String>,
}

pub struct ProfileLockManager {
  locks: RwLock<HashMap<String, ProfileLockInfo>>,
  #[allow(dead_code)]
  heartbeat_handle: Mutex<Option<JoinHandle<()>>>,
  connected: Mutex<bool>,
}

lazy_static! {
  pub static ref PROFILE_LOCK: ProfileLockManager = ProfileLockManager::new();
}

// Keep backward compatibility alias

impl ProfileLockManager {
  fn new() -> Self {
    Self {
      locks: RwLock::new(HashMap::new()),
      heartbeat_handle: Mutex::new(None),
      connected: Mutex::new(false),
    }
  }

  pub async fn connect(&self) {
    log::info!("Connecting profile lock manager");

    {
      let mut c = self.connected.lock().await;
      *c = true;
    }

    if let Err(e) = self.fetch_locks().await {
      log::warn!("Failed to fetch initial profile locks: {e}");
    }

    self.start_heartbeat_loop().await;
  }

  #[allow(dead_code)]
  pub async fn disconnect(&self) {
    log::info!("Disconnecting profile lock manager");

    {
      let mut handle = self.heartbeat_handle.lock().await;
      if let Some(h) = handle.take() {
        h.abort();
      }
    }

    {
      let mut locks = self.locks.write().await;
      locks.clear();
    }

    {
      let mut c = self.connected.lock().await;
      *c = false;
    }
  }

  pub async fn is_connected(&self) -> bool {
    *self.connected.lock().await
  }

  pub async fn acquire_lock(&self, _profile_id: &str) -> Result<(), String> {
    // cloud_auth removed — profile locking disabled
    Err("Cloud auth not available".to_string())
  }

  pub async fn release_lock(&self, _profile_id: &str) -> Result<(), String> {
    // cloud_auth removed — profile locking disabled
    Ok(())
  }

  #[allow(dead_code)]
  pub async fn get_locks(&self) -> Vec<ProfileLockInfo> {
    let locks = self.locks.read().await;
    locks.values().cloned().collect()
  }

  pub async fn get_lock_status(&self, profile_id: &str) -> Option<ProfileLockInfo> {
    let locks = self.locks.read().await;
    locks.get(profile_id).cloned()
  }

  pub async fn is_locked_by_another(&self, _profile_id: &str) -> bool {
    // cloud_auth removed — cannot determine current user
    false
  }

  async fn fetch_locks(&self) -> Result<(), String> {
    // cloud_auth removed — profile locking disabled
    Ok(())
  }

  async fn start_heartbeat_loop(&self) {
    // cloud_auth removed — heartbeat loop disabled
  }
}

/// Acquire profile lock if profile is sync-enabled and user has a paid subscription.
pub async fn acquire_team_lock_if_needed(
  profile: &crate::profile::BrowserProfile,
) -> Result<(), String> {
  if !profile.is_sync_enabled() {
    return Ok(());
  }

  // Ensure lock manager is connected
  if !PROFILE_LOCK.is_connected().await {
    PROFILE_LOCK.connect().await;
  }

  if PROFILE_LOCK
    .is_locked_by_another(&profile.id.to_string())
    .await
  {
    if let Some(lock) = PROFILE_LOCK.get_lock_status(&profile.id.to_string()).await {
      return Err(format!("Profile is in use by {}", lock.locked_by_email));
    }
    return Err("Profile is in use on another device".to_string());
  }

  PROFILE_LOCK.acquire_lock(&profile.id.to_string()).await
}

/// Release profile lock if profile is sync-enabled and user has a paid subscription.
pub async fn release_team_lock_if_needed(profile: &crate::profile::BrowserProfile) {
  if !profile.is_sync_enabled() {
    return;
  }

  if let Err(e) = PROFILE_LOCK.release_lock(&profile.id.to_string()).await {
    log::warn!("Failed to release profile lock for {}: {e}", profile.id);
  }
}

// --- Tauri commands ---

#[tauri::command]
#[allow(dead_code)]
pub async fn get_team_locks() -> Result<Vec<ProfileLockInfo>, String> {
  Ok(PROFILE_LOCK.get_locks().await)
}

#[tauri::command]
#[allow(dead_code)]
pub async fn get_team_lock_status(profile_id: String) -> Result<Option<ProfileLockInfo>, String> {
  Ok(PROFILE_LOCK.get_lock_status(&profile_id).await)
}
