use crate::browser_runner::BrowserRunner;
use crate::profile::BrowserProfile;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio::process::Command as TokioCommand;
use tokio::sync::Mutex as AsyncMutex;

fn push_string_arg(args: &mut Vec<String>, flag: &str, value: &Option<String>) {
  if let Some(value) = value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
    args.push(format!("{flag}={value}"));
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloakConfig {
  #[serde(default)]
  pub fingerprint_seed: Option<String>,
  #[serde(default)]
  pub platform: Option<String>,
  #[serde(default)]
  pub timezone: Option<String>,
  #[serde(default)]
  pub locale: Option<String>,
  #[serde(default)]
  pub user_agent: Option<String>,
  #[serde(default)]
  pub screen_width: Option<u32>,
  #[serde(default)]
  pub screen_height: Option<u32>,
  #[serde(default)]
  pub gpu_vendor: Option<String>,
  #[serde(default)]
  pub gpu_renderer: Option<String>,
  #[serde(default)]
  pub hardware_concurrency: Option<u32>,
  #[serde(default)]
  pub humanize: Option<bool>,
  #[serde(default)]
  pub human_preset: Option<String>,
  #[serde(default)]
  pub headless: Option<bool>,
  #[serde(default)]
  pub geoip: Option<bool>,
  #[serde(default)]
  pub color_scheme: Option<String>,
  #[serde(default)]
  pub launch_args: Vec<String>,
  #[serde(default, skip_serializing)]
  pub proxy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct CloakLaunchResult {
  pub id: String,
  #[serde(alias = "process_id")]
  pub processId: Option<u32>,
  #[serde(alias = "profile_path")]
  pub profilePath: Option<String>,
  pub url: Option<String>,
  pub cdp_port: Option<u16>,
}

#[allow(dead_code)]
struct CloakInstance {
  id: String,
  process_id: Option<u32>,
  profile_path: Option<String>,
  url: Option<String>,
  cdp_port: Option<u16>,
}

struct CloakManagerInner {
  instances: HashMap<String, CloakInstance>,
}

pub struct CloakManager {
  inner: Arc<AsyncMutex<CloakManagerInner>>,
  http_client: Client,
}

impl CloakManager {
  fn new() -> Self {
    Self {
      inner: Arc::new(AsyncMutex::new(CloakManagerInner {
        instances: HashMap::new(),
      })),
      http_client: Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .expect("Failed to build reqwest client for cloak_manager"),
    }
  }

  pub fn instance() -> &'static CloakManager {
    &CLOAK_MANAGER
  }

  #[allow(dead_code)]
  pub fn get_profiles_dir(&self) -> PathBuf {
    crate::app_dirs::profiles_dir()
  }

  async fn find_free_port() -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
  }

  async fn wait_for_cdp_ready(
    &self,
    port: u16,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let url = format!("http://127.0.0.1:{port}/json/version");
    let max_attempts = 120;
    let delay = Duration::from_millis(500);
    let mut last_error: Option<String> = None;

    for attempt in 0..max_attempts {
      match self.http_client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
          log::info!("Cloak CDP ready on port {port} after {attempt} attempts");
          return Ok(());
        }
        Ok(resp) => last_error = Some(format!("HTTP {} from {url}", resp.status())),
        Err(e) => last_error = Some(format!("request failed: {e}")),
      }
      tokio::time::sleep(delay).await;
    }

    Err(
      format!(
        "Cloak CDP not ready after {max_attempts} attempts on port {port}: {}",
        last_error.unwrap_or_else(|| "no attempts completed".to_string())
      )
      .into(),
    )
  }

  #[allow(clippy::too_many_arguments)]
  pub fn build_launch_args(
    profile_path: &str,
    port: u16,
    config: &CloakConfig,
    url: Option<&str>,
    proxy_url: Option<&str>,
    ephemeral: bool,
    extension_paths: &[String],
    force_headless: bool,
  ) -> Vec<String> {
    let mut args = vec![
      format!("--user-data-dir={profile_path}"),
      "--remote-debugging-address=127.0.0.1".to_string(),
      format!("--remote-debugging-port={port}"),
      "--no-first-run".to_string(),
      "--no-default-browser-check".to_string(),
      "--disable-background-mode".to_string(),
      "--disable-component-update".to_string(),
      "--disable-background-timer-throttling".to_string(),
      "--crash-server-url=".to_string(),
      "--disable-updater".to_string(),
      "--disable-session-crashed-bubble".to_string(),
      "--hide-crash-restore-bubble".to_string(),
      "--disable-infobars".to_string(),
      "--disable-features=DialMediaRouteProvider,DnsOverHttps,AsyncDns,Prefetch,PrefetchProxy,SpeculationRulesPrefetchFuture,NoStatePrefetch".to_string(),
      "--use-mock-keychain".to_string(),
      "--password-store=basic".to_string(),
    ];

    push_string_arg(&mut args, "--fingerprint", &config.fingerprint_seed);
    push_string_arg(&mut args, "--fingerprint-platform", &config.platform);
    push_string_arg(&mut args, "--timezone", &config.timezone);
    push_string_arg(&mut args, "--lang", &config.locale);
    push_string_arg(&mut args, "--user-agent", &config.user_agent);
    push_string_arg(&mut args, "--fingerprint-gpu-vendor", &config.gpu_vendor);
    push_string_arg(
      &mut args,
      "--fingerprint-gpu-renderer",
      &config.gpu_renderer,
    );

    if let Some(width) = config.screen_width {
      args.push(format!("--fingerprint-screen-width={width}"));
    }
    if let Some(height) = config.screen_height {
      args.push(format!("--fingerprint-screen-height={height}"));
    }
    if let Some(cores) = config.hardware_concurrency {
      args.push(format!("--fingerprint-hardware-concurrency={cores}"));
    }
    if config.humanize == Some(true) {
      args.push("--humanize".to_string());
    }
    push_string_arg(&mut args, "--human-preset", &config.human_preset);
    if config.geoip == Some(true) {
      args.push("--geoip".to_string());
    }
    push_string_arg(&mut args, "--force-color-profile", &config.color_scheme);

    if force_headless || config.headless == Some(true) {
      args.push("--headless=new".to_string());
    }
    if let (Some(width), Some(height)) = (config.screen_width, config.screen_height) {
      args.push(format!("--window-size={width},{height}"));
      args.push("--window-position=0,0".to_string());
    }

    #[cfg(target_os = "linux")]
    {
      args.push("--no-sandbox".to_string());
      args.push("--disable-setuid-sandbox".to_string());
      args.push("--disable-dev-shm-usage".to_string());
    }

    if ephemeral {
      args.push("--disk-cache-size=1".to_string());
      args.push("--disable-breakpad".to_string());
      args.push("--disable-crash-reporter".to_string());
      args.push("--no-service-autorun".to_string());
      args.push("--disable-sync".to_string());
    }

    if !extension_paths.is_empty() {
      args.push(format!("--load-extension={}", extension_paths.join(",")));
    }

    if let Some(proxy) = proxy_url {
      let pac_data = format!(
        "data:application/x-ns-proxy-autoconfig,function FindProxyForURL(url,host){{return \"PROXY {}\";}}",
        proxy.trim_start_matches("http://").trim_start_matches("https://")
      );
      args.push(format!("--proxy-pac-url={pac_data}"));
      args.push("--dns-prefetch-disable".to_string());
    }

    args.extend(config.launch_args.iter().filter_map(|arg| {
      let trimmed = arg.trim();
      if trimmed.is_empty() {
        None
      } else {
        Some(trimmed.to_string())
      }
    }));

    if let Some(url) = url {
      args.push(url.to_string());
    }

    args
  }

  #[allow(clippy::too_many_arguments)]
  pub async fn launch_cloak(
    &self,
    _app_handle: &AppHandle,
    profile: &BrowserProfile,
    profile_path: &str,
    config: &CloakConfig,
    url: Option<&str>,
    proxy_url: Option<&str>,
    ephemeral: bool,
    extension_paths: &[String],
    remote_debugging_port: Option<u16>,
    headless: bool,
  ) -> Result<CloakLaunchResult, Box<dyn std::error::Error + Send + Sync>> {
    let executable_path = BrowserRunner::instance()
      .get_browser_executable_path(profile)
      .map_err(|e| format!("Failed to get Cloak executable path: {e}"))?;
    let port = match remote_debugging_port {
      Some(p) => p,
      None => Self::find_free_port().await?,
    };
    let args = Self::build_launch_args(
      profile_path,
      port,
      config,
      url,
      proxy_url,
      ephemeral,
      extension_paths,
      headless,
    );

    let mut command = TokioCommand::new(&executable_path);
    command
      .args(&args)
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null());

    let child = command
      .spawn()
      .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
        let hint = if e.raw_os_error() == Some(14001) {
          ". This usually means the Visual C++ Redistributable is not installed. Download it from https://aka.ms/vs/17/release/vc_redist.x64.exe"
        } else {
          ""
        };
        format!("Failed to spawn Cloak: {e}{hint}").into()
      })?;
    let process_id = child.id();
    drop(child);

    self.wait_for_cdp_ready(port).await?;

    let id = uuid::Uuid::new_v4().to_string();
    let instance = CloakInstance {
      id: id.clone(),
      process_id,
      profile_path: Some(profile_path.to_string()),
      url: url.map(str::to_string),
      cdp_port: Some(port),
    };

    let mut inner = self.inner.lock().await;
    inner.instances.insert(id.clone(), instance);

    Ok(CloakLaunchResult {
      id,
      processId: process_id,
      profilePath: Some(profile_path.to_string()),
      url: url.map(str::to_string),
      cdp_port: Some(port),
    })
  }

  #[allow(dead_code)]
  pub async fn stop_cloak(&self, id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut inner = self.inner.lock().await;
    if let Some(instance) = inner.instances.remove(id) {
      log::info!("Cleaning up Cloak instance {}", instance.id);
      if let Some(pid) = instance.process_id {
        #[cfg(unix)]
        {
          use nix::sys::signal::{kill, Signal};
          use nix::unistd::Pid;
          let _ = kill(Pid::from_raw(pid as i32), Signal::SIGTERM);
        }
        #[cfg(windows)]
        {
          use std::os::windows::process::CommandExt;
          const CREATE_NO_WINDOW: u32 = 0x08000000;
          let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        }
      }
    }
    Ok(())
  }

  pub async fn find_cloak_by_profile(&self, profile_path: &str) -> Option<CloakLaunchResult> {
    use sysinfo::{ProcessRefreshKind, RefreshKind, System};
    let mut inner = self.inner.lock().await;
    let target_path = std::path::Path::new(profile_path)
      .canonicalize()
      .unwrap_or_else(|_| std::path::Path::new(profile_path).to_path_buf());

    let mut found_id: Option<String> = None;
    for (id, instance) in &inner.instances {
      if let Some(path) = &instance.profile_path {
        let instance_path = std::path::Path::new(path)
          .canonicalize()
          .unwrap_or_else(|_| std::path::Path::new(path).to_path_buf());
        if instance_path == target_path {
          found_id = Some(id.clone());
          break;
        }
      }
    }

    if let Some(id) = found_id {
      if let Some(instance) = inner.instances.get(&id) {
        if let Some(pid) = instance.process_id {
          let system = System::new_with_specifics(
            RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
          );
          if system.process(sysinfo::Pid::from_u32(pid)).is_some() {
            return Some(CloakLaunchResult {
              id: id.clone(),
              processId: instance.process_id,
              profilePath: instance.profile_path.clone(),
              url: instance.url.clone(),
              cdp_port: instance.cdp_port,
            });
          }
        }
      }
      inner.instances.remove(&id);
    }

    if let Some((pid, found_profile_path, cdp_port)) =
      Self::find_cloak_process_by_profile(&target_path)
    {
      let instance_id = format!("recovered_{pid}");
      inner.instances.insert(
        instance_id.clone(),
        CloakInstance {
          id: instance_id.clone(),
          process_id: Some(pid),
          profile_path: Some(found_profile_path.clone()),
          url: None,
          cdp_port,
        },
      );
      return Some(CloakLaunchResult {
        id: instance_id,
        processId: Some(pid),
        profilePath: Some(found_profile_path),
        url: None,
        cdp_port,
      });
    }

    None
  }

  pub async fn open_url_in_tab(
    &self,
    profile_path: &str,
    url: &str,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let inner = self.inner.lock().await;
    let target_path = std::path::Path::new(profile_path)
      .canonicalize()
      .unwrap_or_else(|_| std::path::Path::new(profile_path).to_path_buf());

    let port = inner
      .instances
      .values()
      .find(|i| {
        i.profile_path
          .as_deref()
          .map(|p| {
            std::path::Path::new(p)
              .canonicalize()
              .unwrap_or_else(|_| std::path::Path::new(p).to_path_buf())
              == target_path
          })
          .unwrap_or(false)
      })
      .and_then(|i| i.cdp_port)
      .ok_or("Cloak instance (with CDP port) not found for profile")?;
    drop(inner);

    let new_tab_url = format!(
      "http://127.0.0.1:{port}/json/new?{}",
      urlencoding::encode(url)
    );
    let resp = self
      .http_client
      .put(&new_tab_url)
      .send()
      .await
      .map_err(|e| format!("Failed to open new tab: {e}"))?;
    if !resp.status().is_success() {
      return Err(format!("CDP /json/new returned HTTP {}", resp.status()).into());
    }
    Ok(())
  }

  fn find_cloak_process_by_profile(
    target_path: &std::path::Path,
  ) -> Option<(u32, String, Option<u16>)> {
    use sysinfo::{ProcessRefreshKind, RefreshKind, System};
    let system = System::new_with_specifics(
      RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
    );
    let target_path_str = target_path.to_string_lossy();

    for (pid, process) in system.processes() {
      let cmd = process.cmd();
      if cmd.is_empty() {
        continue;
      }
      let exe_name = process.name().to_string_lossy().to_lowercase();
      let is_cloak_like =
        exe_name.contains("cloak") || exe_name.contains("chromium") || exe_name.contains("chrome");
      if !is_cloak_like {
        continue;
      }
      if cmd
        .iter()
        .any(|a| a.to_str().is_some_and(|s| s.starts_with("--type=")))
      {
        continue;
      }

      let mut matched = false;
      let mut cdp_port: Option<u16> = None;
      for arg in cmd.iter() {
        if let Some(arg_str) = arg.to_str() {
          if let Some(dir_val) = arg_str.strip_prefix("--user-data-dir=") {
            let cmd_path = std::path::Path::new(dir_val)
              .canonicalize()
              .unwrap_or_else(|_| std::path::Path::new(dir_val).to_path_buf());
            if cmd_path == target_path {
              matched = true;
            }
          }
          if let Some(port_val) = arg_str.strip_prefix("--remote-debugging-port=") {
            cdp_port = port_val.parse().ok();
          }
        }
      }
      if matched {
        return Some((pid.as_u32(), target_path_str.to_string(), cdp_port));
      }
    }

    None
  }
}

lazy_static::lazy_static! {
  static ref CLOAK_MANAGER: CloakManager = CloakManager::new();
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn launch_args_include_fingerprint_proxy_cdp_and_profile_flags() {
    let config = CloakConfig {
      fingerprint_seed: Some("12345".to_string()),
      platform: Some("windows".to_string()),
      screen_width: Some(1920),
      screen_height: Some(1080),
      gpu_vendor: Some("Intel Inc.".to_string()),
      gpu_renderer: Some("Intel Iris".to_string()),
      hardware_concurrency: Some(8),
      launch_args: vec!["--custom-flag".to_string()],
      ..Default::default()
    };
    let args = CloakManager::build_launch_args(
      "/tmp/profile",
      9333,
      &config,
      Some("https://example.com"),
      Some("http://127.0.0.1:8080"),
      false,
      &["/tmp/ext".to_string()],
      false,
    );

    assert!(args.contains(&"--user-data-dir=/tmp/profile".to_string()));
    assert!(args.contains(&"--remote-debugging-address=127.0.0.1".to_string()));
    assert!(args.contains(&"--remote-debugging-port=9333".to_string()));
    assert!(args.contains(&"--fingerprint=12345".to_string()));
    assert!(args.contains(&"--fingerprint-platform=windows".to_string()));
    assert!(args.contains(&"--fingerprint-screen-width=1920".to_string()));
    assert!(args.contains(&"--fingerprint-screen-height=1080".to_string()));
    assert!(args.contains(&"--fingerprint-gpu-vendor=Intel Inc.".to_string()));
    assert!(args.contains(&"--fingerprint-gpu-renderer=Intel Iris".to_string()));
    assert!(args.contains(&"--fingerprint-hardware-concurrency=8".to_string()));
    assert!(args.iter().any(|arg| arg.starts_with("--proxy-pac-url=")));
    assert!(args.contains(&"--load-extension=/tmp/ext".to_string()));
    assert!(args.contains(&"--custom-flag".to_string()));
    assert_eq!(args.last().map(String::as_str), Some("https://example.com"));
  }
}
