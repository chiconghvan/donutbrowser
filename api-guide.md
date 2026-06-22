# Donut Browser API Guide

## Overview

Donut Browser exposes **3 API layers**:

| Layer | Port (default) | Protocol | Auth | Purpose |
|-------|---------------|----------|------|---------|
| **REST API** | `10108` | HTTP (Axum) | None (removed) | External automation via HTTP |
| **MCP API** | `51080` | HTTP JSON-RPC / Model Context Protocol | Bearer token or URL token | AI agent integration (Claude Desktop, etc.) |
| **Tauri IPC** | _(in-process)_ | `invoke()` / `emit()` / `listen()` | In-app | Frontend ↔ Backend communication |

**Note:** REST API auth (Bearer JWT) was removed. No token needed. Pro entitlement checks still exist in some handlers (run/open-url/kill/camoufox config edit) — these require a valid cloud login session.

---

## REST API (`/v1/`)

Base URL: `http://127.0.0.1:10108/v1`

Auth: **None** — bearer token auth removed. No `Authorization` header required.

### Profiles

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/profiles` | List all profiles |
| `GET` | `/v1/profiles/{id}` | Get profile by ID |
| `POST` | `/v1/profiles` | Create a new profile |
| `PUT` | `/v1/profiles/{id}` | Update profile fields |
| `DELETE` | `/v1/profiles/{id}` | Delete profile |
| `GET` | `/v1/profiles/{id}/run` | Launch browser (requires cloud login + active subscription) |
| `POST` | `/v1/profiles/{id}/open-url` | Open URL in running browser (requires cloud login + active subscription) |
| `POST` | `/v1/profiles/{id}/kill` | Kill browser process (requires cloud login + active subscription) |
| `POST` | `/v1/profiles/{id}/cookies/import` | Import cookies into profile |

### Groups

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/groups` | List all groups |
| `GET` | `/v1/groups/{id}` | Get group by ID |
| `POST` | `/v1/groups` | Create a new group |
| `PUT` | `/v1/groups/{id}` | Update group name |
| `DELETE` | `/v1/groups/{id}` | Delete group |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/tags` | List all tags |

### Proxies

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/proxies` | List all proxies |
| `GET` | `/v1/proxies/{id}` | Get proxy by ID |
| `POST` | `/v1/proxies` | Create a new proxy |
| `PUT` | `/v1/proxies/{id}` | Update proxy |
| `DELETE` | `/v1/proxies/{id}` | Delete proxy |

### VPNs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/vpns` | List all VPN configs |
| `GET` | `/v1/vpns/{id}` | Get VPN config by ID |
| `GET` | `/v1/vpns/{id}/export` | Export decrypted VPN config |
| `POST` | `/v1/vpns` | Create a new VPN config |
| `POST` | `/v1/vpns/import` | Import VPN from `.conf` content |
| `PUT` | `/v1/vpns/{id}` | Update VPN name |
| `DELETE` | `/v1/vpns/{id}` | Delete VPN config |

### Extensions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/extensions` | List all extensions |
| `GET` | `/v1/extension-groups` | List all extension groups |
| `DELETE` | `/v1/extensions/{id}` | Delete an extension |
| `DELETE` | `/v1/extension-groups/{id}` | Delete an extension group |

### Browsers

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/browsers/download` | Download a browser binary |
| `GET` | `/v1/browsers/{browser}/versions` | List available versions |
| `GET` | `/v1/browsers/{browser}/versions/{version}/downloaded` | Check if version is downloaded |

### Wayfern Token

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/wayfern-token` | Get current Wayfern API token |
| `POST` | `/v1/wayfern-token/refresh` | Refresh Wayfern API token |

### Utility

| Path | Description |
|------|-------------|
| `/openapi.json` | Full OpenAPI spec |
| `/v1/openapi.json` | OpenAPI spec (v1 only) |

### Request / Response Shapes

#### `GET /v1/profiles`

Response:
```json
{
  "profiles": [
    {
      "id": "uuid",
      "name": "My Profile",
      "browser": "camoufox",
      "version": "135.0.1-beta.24",
      "group_id": "group-uuid",
      "proxy_id": "proxy-uuid",
      "tags": ["social", "us"],
      "is_running": false
    }
  ]
}
```

#### `GET /v1/profiles/{id}`

Response:
```json
{
  "profile": {
    "id": "uuid",
    "name": "My Profile",
    "browser": "camoufox",
    "version": "135.0.1-beta.24",
    "proxy_id": null,
    "vpn_id": null,
    "launch_hook": null,
    "process_id": null,
    "last_launch": null,
    "release_type": "stable",
    "camoufox_config": null,
    "group_id": null,
    "tags": ["social", "us"],
    "is_running": false,
    "proxy_bypass_rules": []
  }
}
```

#### `POST /v1/profiles`

```json
{
  "name": "My Profile",
  "browser": "camoufox",
  "version": "135.0.1-beta.24",
  "proxy_id": null,
  "vpn_id": null,
  "launch_hook": null,
  "release_type": "stable",
  "camoufox_config": null,
  "wayfern_config": null,
  "group_id": null,
  "tags": ["social", "us"]
}
```

Response:
```json
{
  "profile": {
    "id": "uuid",
    "name": "My Profile",
    "browser": "camoufox",
    "version": "135.0.1-beta.24",
    "group_id": null,
    "proxy_id": null,
    "tags": ["social", "us"]
  }
}
```

#### `PUT /v1/profiles/{id}`

Partial update — only included fields are changed:
```json
{
  "name": "Renamed",
  "version": "136.0.0",
  "proxy_id": "new-proxy-uuid",
  "vpn_id": "",
  "launch_hook": "",
  "camoufox_config": { ... },
  "group_id": "group-uuid",
  "tags": ["new-tag"],
  "extension_group_id": "ext-group-uuid",
  "proxy_bypass_rules": ["*.local"],
  "sync_mode": "Regular"
}
```

Response:
```json
{
  "profile": {
    "id": "uuid",
    "name": "Renamed",
    "version": "136.0.0",
    "group_id": "group-uuid",
    "proxy_id": "new-proxy-uuid",
    "tags": ["new-tag"]
  }
}
```

#### `GET /v1/profiles/{id}/run`

Query params:

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | No | URL to open after launch |
| `headless` | boolean | No | Launch browser in headless mode |

Example:

```http
GET /v1/profiles/{id}/run?url=https%3A%2F%2Fexample.com&headless=false
```

Response:
```json
{
  "profile_id": "uuid",
  "name": "My Profile",
  "proxy": "http://user:pass@host:port",
  "remote_debugging_port": 9222,
  "headless": false
}
```

`proxy` is `null` if no proxy is configured.

#### `POST /v1/profiles/{id}/kill`

Response:
```json
{
  "profile_id": "uuid",
  "killed": true
}
```

#### `GET /v1/profiles/{id}/status`

Response:
```json
{
  "profile_id": "uuid",
  "is_running": true,
  "process_id": 12345
}
```

#### `DELETE /v1/profiles/{id}`

Response: `204 No Content`

#### `POST /v1/profiles/{id}/cookies/import`

```json
{
  "content": "[{\"name\": \"session\", \"value\": \"abc\", \"domain\": \".example.com\"}]"
}
```

Response:
```json
{
  "cookies_imported": 5,
  "cookies_replaced": 0,
  "errors": []
}
```

#### `GET /v1/groups`

Response:
```json
{
  "groups": [
    {
      "id": "group-uuid",
      "name": "Shopping",
      "profile_count": 4
    }
  ]
}
```

#### `GET /v1/groups/{id}`

Response:
```json
{
  "group": {
    "id": "group-uuid",
    "name": "Shopping",
    "profile_count": 4
  }
}
```

#### `POST /v1/groups`

```json
{
  "name": "Shopping"
}
```

Response:
```json
{
  "group": {
    "id": "group-uuid",
    "name": "Shopping"
  }
}
```

#### `PUT /v1/groups/{id}`

```json
{
  "name": "New Group Name"
}
```

Response:
```json
{
  "group": {
    "id": "group-uuid",
    "name": "New Group Name"
  }
}
```

#### `DELETE /v1/groups/{id}`

Response: `204 No Content`

#### `GET /v1/proxies`

Response:
```json
{
  "proxies": [
    {
      "id": "proxy-uuid",
      "name": "US Proxy",
      "type": "socks5",
      "host": "127.0.0.1",
      "port": 1080,
      "username": "user",
      "password": "***"
    }
  ]
}
```

#### `GET /v1/proxies/{id}`

Response:
```json
{
  "proxy": {
    "id": "proxy-uuid",
    "name": "US Proxy",
    "type": "socks5",
    "host": "127.0.0.1",
    "port": 1080,
    "username": "user",
    "password": "***"
  }
}
```

#### `POST /v1/proxies`

```json
{
  "name": "US Proxy",
  "type": "socks5",
  "host": "127.0.0.1",
  "port": 1080,
  "username": "user",
  "password": "pass"
}
```

Response:
```json
{
  "proxy": {
    "id": "proxy-uuid",
    "name": "US Proxy"
  }
}
```

#### `PUT /v1/proxies/{id}`

```json
{
  "name": "Updated Proxy",
  "type": "socks5",
  "host": "127.0.0.1",
  "port": 1081,
  "username": "user2",
  "password": "new-pass"
}
```

Response:
```json
{
  "proxy": {
    "id": "proxy-uuid",
    "name": "Updated Proxy"
  }
}
```

#### `DELETE /v1/proxies/{id}`

Response: `204 No Content`

#### `POST /v1/vpns/import`

```json
{
  "content": "[Interface]\nPrivateKey = ...\n...",
  "filename": "my-vpn.conf",
  "name": "My VPN"
}
```

#### `POST /v1/browsers/download`

```json
{
  "browser": "camoufox",
  "version": "135.0.1-beta.24"
}
```

#### `POST /v1/profiles/{id}/cookies/import`

```json
{
  "content": "[{\"name\": \"session\", \"value\": \"abc\", \"domain\": \".example.com\"}]"
}
```

Response:
```json
{
  "cookies_imported": 5,
  "cookies_replaced": 0,
  "errors": []
}
```

### Profiles Response Shape

Every profile GET returns:
```json
{
  "profile": {
    "id": "uuid",
    "name": "string",
    "browser": "camoufox|wayfern",
    "version": "string",
    "proxy_id": "uuid|null",
    "vpn_id": "uuid|null",
    "launch_hook": "string|null",
    "process_id": "number|null",
    "last_launch": "number|null",
    "release_type": "stable|beta|nightly",
    "camoufox_config": "object|null",
    "group_id": "string|null",
    "tags": ["string"],
    "is_running": false,
    "proxy_bypass_rules": ["string"],
    "vpn_id": "string|null"
  }
}
```

### Error Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `204` | Deleted (no body) |
| `400` | Bad request (invalid fields, profile locked) |
| `402` | Payment Required (need cloud login + active subscription) |
| `403` | Wayfern terms not accepted |
| `404` | Not found |
| `409` | Conflict (team lock, browser running) |
| `500` | Internal server error |

**Note:** `401` was removed with JWT auth. REST API no longer returns Unauthorized.

---

## Tauri IPC Commands

Frontend ↔ Backend via `@tauri-apps/api/core` `invoke()`. These are **not** HTTP-accessible — internal only.

### Profiles

| Command | Params | Description |
|---------|--------|-------------|
| `list_browser_profiles` | — | List all profiles |
| `create_browser_profile_new` | `appHandle, name, browser, version, releaseType, groupId, tags, launchHook, proxyId, vpnId` | Create profile |
| `delete_profile` | `appHandle, profileId` | Delete profile |
| `rename_profile` | `appHandle, profileId, newName` | Rename |
| `clone_profile` | `appHandle, profileId, newName` | Clone profile |
| `check_browser_status` | `appHandle, profileId` | Check if running |
| `launch_browser_profile` | `appHandle, profileId, url, headless, remoteDebuggingPort` | Launch browser |
| `kill_browser_profile` | `appHandle, profileId` | Kill profile process |
| `open_url_with_profile` | `appHandle, profileId, url` | Open URL in running browser |
| `update_profile_proxy` | `appHandle, profileId, proxyId` | Update proxy |
| `update_profile_vpn` | `appHandle, profileId, vpnId` | Update VPN |
| `update_profile_tags` | `appHandle, profileId, tags` | Update tags |
| `update_profile_note` | `appHandle, profileId, note` | Update note |
| `update_profile_launch_hook` | `appHandle, profileId, launchHook` | Update launch hook |
| `update_profile_proxy_bypass_rules` | `appHandle, profileId, rules` | Update bypass rules |
| `update_profile_dns_blocklist` | `appHandle, profileId, level` | Update DNS blocklist |
| `update_camoufox_config` | `appHandle, profileId, config` | Update Camoufox fingerprint |
| `update_wayfern_config` | `appHandle, profileId, config` | Update Wayfern config |
| `assign_profiles_to_group` | `appHandle, profileIds, groupId` | Assign to group |
| `delete_selected_profiles` | `appHandle, profileIds` | Batch delete |

### Profile Passwords

| Command | Params | Description |
|---------|--------|-------------|
| `set_profile_password` | `appHandle, profileId, password` | Set password |
| `remove_profile_password` | `appHandle, profileId` | Remove password |
| `change_profile_password` | `appHandle, profileId, oldPw, newPw` | Change password |
| `verify_profile_password` | `profileId, password` | Verify before launch |
| `is_profile_locked` | `profileId` | Check locked state |
| `lock_profile` | `profileId` | Lock profile |
| `unlock_profile` | `profileId, password` | Unlock for launch |

### Proxies

| Command | Params | Description |
|---------|--------|-------------|
| `create_stored_proxy` | `appHandle, name, proxySettings` | Create proxy |
| `get_stored_proxies` | — | List all |
| `update_stored_proxy` | `appHandle, proxyId, name, proxySettings` | Update |
| `delete_stored_proxy` | `appHandle, proxyId` | Delete |
| `check_proxy_validity` | `proxyId, proxySettings` | Check if working |
| `get_cached_proxy_check` | `proxyId` | Get cached check result |
| `export_proxies` | `format` | Export (json/txt) |
| `import_proxies_json` | `appHandle, content` | Import JSON |
| `parse_txt_proxies` | `content` | Parse txt to structured |
| `import_proxies_from_parsed` | `appHandle, parsedProxies, namePrefix` | Bulk import parsed |

### Groups

| Command | Params | Description |
|---------|--------|-------------|
| `get_profile_groups` | — | List groups |
| `get_groups_with_profile_counts` | — | Groups with counts |
| `create_profile_group` | `appHandle, name` | Create group |
| `update_profile_group` | `appHandle, groupId, name` | Update |
| `delete_profile_group` | `appHandle, groupId` | Delete |

### VPNs

| Command | Params | Description |
|---------|--------|-------------|
| `import_vpn_config` | `content, filename, name` | Import .conf |
| `list_vpn_configs` | — | List all |
| `get_vpn_config` | `vpnId` | Get one |
| `delete_vpn_config` | `appHandle, vpnId` | Delete |
| `create_vpn_config_manual` | `name, vpnType, configData` | Create manually |
| `update_vpn_config` | `vpnId, name` | Update name |
| `check_vpn_validity` | `vpnId` | Check connection works |
| `connect_vpn` | `vpnId` | Connect WireGuard |
| `disconnect_vpn` | `vpnId` | Disconnect |
| `get_vpn_status` | `vpnId` | Get connection status |
| `list_active_vpn_connections` | — | List connected VPNs |

### Browser Management

| Command | Params | Description |
|---------|--------|-------------|
| `download_browser` | `appHandle, browserStr, version` | Download browser binary |
| `cancel_download` | `browserStr, version` | Cancel download |
| `get_downloaded_browser_versions` | `browserStr` | List downloaded versions |
| `check_missing_binaries` | — | Find missing binaries |
| `ensure_all_binaries_exist` | — | Verify all binaries |
| `ensure_active_browsers_downloaded` | — | Ensure active profiles have binaries |
| `fetch_browser_versions_cached_first` | `browserStr` | Fetch versions with cache |
| `fetch_browser_versions_with_count` | `browserStr` | Fetch versions with count |
| `fetch_browser_versions_with_count_cached_first` | `browserStr` | Cached version fetch |
| `get_supported_browsers` | — | List supported browsers |
| `is_browser_supported_on_platform` | `browserStr` | Platform check |
| `get_browser_release_types` | — | Get release types |
| `check_for_browser_updates` | — | Check for updates |
| `complete_browser_update_with_auto_update` | `appHandle` | Apply updates |
| `dismiss_update_notification` | — | Dismiss update notice |

### Extensions

| Command | Params | Description |
|---------|--------|-------------|
| `list_extensions` | — | List all |
| `list_extension_groups` | — | List groups |
| `get_extension_group_for_profile` | `profileId` | Get group for profile |
| `create_extension_group` | `appHandle, name` | Create group |
| `update_extension_group` | `appHandle, groupId, name` | Update group |
| `delete_extension_group` | `appHandle, groupId` | Delete group |
| `add_extension_to_group` | `appHandle, extensionId, groupId` | Add to group |
| `remove_extension_from_group` | `appHandle, extensionId, groupId` | Remove from group |
| `assign_extension_group_to_profile` | `appHandle, profileId, extensionGroupId` | Assign to profile |
| `add_extension` | `appHandle, crxPath, name, groupId` | Add extension |
| `update_extension` | `appHandle, extensionId, name` | Update |
| `delete_extension` | `appHandle, extensionId` | Delete |
| `get_extension_icon` | `extensionId` | Get icon |

### Cookies

| Command | Params | Description |
|---------|--------|-------------|
| `read_profile_cookies` | `profileId` | Read cookies |
| `get_profile_cookie_stats` | `profileId` | Get cookie stats |
| `copy_profile_cookies` | `appHandle, request` | Copy between profiles |
| `import_cookies_from_file` | `appHandle, profileId, content` | Import cookies |
| `export_profile_cookies` | `profileId, format` | Export (json/netscape) |

### Settings

| Command | Params | Description |
|---------|--------|-------------|
| `get_app_settings` | — | Read all settings |
| `save_app_settings` | `appHandle, settings` | Save settings |
| `get_system_info` | — | OS, platform info |
| `get_system_language` | — | System language |
| `open_log_directory` | — | Open logs folder |
| `read_log_files` | — | Read log files |
| `complete_onboarding` | `appHandle` | Mark onboarding done |
| `get_onboarding_completed` | — | Check onboarding |
| `get_window_resize_warning_dismissed` | — | Check warning state |
| `dismiss_window_resize_warning` | `appHandle` | Dismiss warning |
| `get_table_sorting_settings` | — | Table sort prefs |
| `save_table_sorting_settings` | `appHandle, settings` | Save table sort |
| `get_sync_settings` | — | Sync settings |
| `save_sync_settings` | `appHandle, settings` | Save sync settings |

### Sync / Cloud

| Command | Params | Description |
|---------|--------|-------------|
| `request_profile_sync` | `appHandle, profileId` | Queue profile sync |
| `cancel_profile_sync` | `profileId` | Cancel queued sync |
| `get_unsynced_entity_counts` | `appHandle` | Unsynced counts |
| `set_profile_sync_mode` | `appHandle, profileId, mode` | Set sync mode |
| `enable_sync_for_all_entities` | `appHandle` | Enable all sync |
| `set_e2e_password` | `appHandle, password` | Set E2E encryption pw |
| `verify_e2e_password` | `appHandle, profileId` | Verify E2E pw |
| `check_has_e2e_password` | — | Check E2E set |
| `delete_e2e_password` | `appHandle` | Delete E2E pw |
| `rollover_encryption_for_all_entities` | `appHandle` | Re-encrypt all |
| `set_group_sync_enabled` | `appHandle, groupId, enabled` | Toggle group sync |
| `set_proxy_sync_enabled` | `appHandle, proxyId, enabled` | Toggle proxy sync |
| `set_vpn_sync_enabled` | `appHandle, vpnId, enabled` | Toggle VPN sync |
| `set_extension_sync_enabled` | `appHandle, extensionId, enabled` | Toggle ext sync |
| `set_extension_group_sync_enabled` | `appHandle, groupId, enabled` | Toggle ext group sync |
| `is_group_in_use_by_synced_profile` | `groupId` | Check group sync |
| `is_proxy_in_use_by_synced_profile` | `proxyId` | Check proxy sync |
| `is_vpn_in_use_by_synced_profile` | `vpnId` | Check VPN sync |

### Cloud Auth

| Command | Params | Description |
|---------|--------|-------------|
| `auth_guest_login` | — | Guest login |
| `auth_login` | `email, password` | Email login |
| `auth_register` | `email, password` | Register |
| `auth_logout` | — | Logout |
| `auth_reset_password` | `email` | Reset password |
| `auth_get_user` | — | Get user info |
| `is_logged_in` | — | Check login |
| `has_active_subscription` | — | Check subscription |
| `get_wayfern_token` | — | Get Wayfern API token |
| `set_wayfern_token` | `token` | Set Wayfern token |
| `request_wayfern_token` | — | Request new token |

### Commercial / Trial

| Command | Params | Description |
|---------|--------|-------------|
| `get_commercial_trial_status` | `appHandle` | Trial info |
| `acknowledge_trial_expiration` | `appHandle` | Acknowledge expiry |
| `has_acknowledged_trial_expiration` | `appHandle` | Check acknowledged |

### MCP Server

| Command | Params | Description |
|---------|--------|-------------|
| `start_mcp_server` | `appHandle` | Start MCP server |
| `stop_mcp_server` | — | Stop MCP server |
| `get_mcp_server_status` | — | Check if running |
| `get_mcp_config` | `appHandle` | Get MCP URL + token |
| `list_mcp_agents` | — | List connected agents |
| `add_mcp_to_agent` | `appHandle, agentId` | Add to Claude Desktop etc. |
| `remove_mcp_from_agent` | `agentId` | Remove agent |

### API Server

| Command | Params | Description |
|---------|--------|-------------|
| `start_api_server` | `port, appHandle` | Start REST API (default 10108) |
| `stop_api_server` | — | Stop REST API |
| `get_api_server_status` | — | Check if running |

### GeoIP

| Command | Params | Description |
|---------|--------|-------------|
| `is_geoip_database_available` | — | Check GeoIP DB |
| `download_geoip_database` | `appHandle` | Download GeoIP DB |
| `check_missing_geoip_database` | — | Check if needed |

### Traffic Stats

| Command | Params | Description |
|---------|--------|-------------|
| `get_all_traffic_snapshots` | — | All snapshots |
| `get_profile_traffic_snapshot` | `profileId` | Per profile |
| `clear_all_traffic_stats` | — | Clear all |
| `get_traffic_stats_for_period` | `profileId, seconds` | Filtered stats |

### DNS Blocklist

| Command | Params | Description |
|---------|--------|-------------|
| `get_dns_blocklist_status` | — | Blocklist cache status |
| `update_profile_dns_blocklist` | `appHandle, profileId, level` | Set blocklist level |

### Tags

| Command | Params | Description |
|---------|--------|-------------|
| `get_all_tags` | — | List all tags |

### Team Lock

| Command | Params | Description |
|---------|--------|-------------|
| `get_team_locks` | — | Active locks |
| `release_team_lock` | `profileId` | Release lock |

### Version Updater

| Command | Params | Description |
|---------|--------|-------------|
| `get_version_update_status` | — | Version check status |
| `trigger_manual_version_update` | `appHandle` | Force version check |
| `clear_all_version_cache_and_refetch` | — | Clear + refetch |

### Profile Import

| Command | Params | Description |
|---------|--------|-------------|
| `detect_existing_profiles` | — | Scan for importable profiles |
| `import_browser_profile` | `appHandle, profile` | Import from other browsers |

### App Auto-Updater

| Command | Params | Description |
|---------|--------|-------------|
| `check_for_app_updates` | — | Check for new app version |
| `check_for_app_updates_manual` | — | Manual check |
| `download_and_prepare_app_update` | — | Download update |
| `restart_application` | — | Restart to apply |

### Other

| Command | Params | Description |
|---------|--------|-------------|
| `check_wayfern_terms_accepted` | — | Terms check |
| `check_wayfern_downloaded` | — | Wayfern downloaded? |
| `accept_wayfern_terms` | — | Accept terms |
| `generate_sample_fingerprint` | `appHandle, browser, version, configJson` | Preview fingerprint |
| `confirm_quit` | `appHandle` | Confirm app quit |
| `hide_to_tray` | `appHandle` | Minimize to tray |
| `update_tray_menu` | `appHandle, showLabel, quitLabel` | Localize tray menu |
| `is_default_browser` | — | Check default browser |
| `set_as_default_browser` | — | Set as default |

---

## Frontend Events (Tauri `emit` / `listen`)

Backend → Frontend push events:

| Event | Payload | When |
|-------|---------|------|
| `download-progress` | `{browser, version, downloadedBytes, totalBytes, percentage, speedBytesPerSec, etaSeconds, stage}` | Browser download progress |
| `geoip-download-progress` | `{stage, percentage, message}` | GeoIP DB download |
| `profile-running-changed` | `{id, isRunning}` | Browser start/stop |
| `profiles-changed` | — | Profile CRUD |
| `groups-changed` | — | Group CRUD |
| `vpn-configs-changed` | — | VPN config CRUD |
| `api-port-conflict` | `string` | API server fallback port |
| `close-confirm-requested` | — | User clicked close |
| `show-profile-selector` | `url` | Deep link to profile |
| `app-update-available` | `{currentVersion, newVersion}` | New app version |
| `proxy-*` | various | Proxy connection events |

---

## MCP Server (Model Context Protocol)

Endpoint: `http://127.0.0.1:51080/mcp/{token}` (or `http://127.0.0.1:51080/mcp` with `Authorization: Bearer <token>`)

Health: `GET http://127.0.0.1:51080/health`

MCP is a JSON-RPC 2.0 protocol. Must call `initialize` first, then can call `tools/list` and `tools/call`.

### Available MCP Tools

**Profile Management:**
- `list_profiles` — List all Wayfern/Camoufox profiles
- `get_profile` — Get profile by ID
- `create_profile` — Create profile
- `update_profile` — Update profile fields
- `delete_profile` — Delete profile
- `run_profile` — Launch profile (requires cloud login + active subscription)
- `kill_profile` — Stop profile (requires cloud login + active subscription)
- `get_profile_status` — Check if running

**Group Management:**
- `list_groups` — List all groups
- `get_group` — Get group by ID
- `create_group` — Create group
- `update_group` — Rename group
- `delete_group` — Delete group
- `assign_profiles_to_group` — Assign profiles to group

**Tag Management:**
- `list_tags` — List all tags

**Proxy Management:**
- `list_proxies` — List all proxies
- `get_proxy` — Get proxy by ID
- `create_proxy` — Create proxy
- `update_proxy` — Update proxy
- `delete_proxy` — Delete proxy
- `export_proxies` — Export (json/txt)
- `import_proxies` — Import from JSON/TXT

**VPN Management:**
- `import_vpn` — Import WireGuard .conf
- `list_vpn_configs` — List VPN configs
- `delete_vpn` — Delete VPN config
- `connect_vpn` — Connect VPN
- `disconnect_vpn` — Disconnect VPN
- `get_vpn_status` — Check VPN status

**Fingerprint:**
- `get_profile_fingerprint` — Get fingerprint (requires cloud login + active subscription)
- `update_profile_fingerprint` — Update fingerprint (requires cloud login + active subscription)

**DNS Blocklist:**
- `update_profile_dns_blocklist` — Set blocklist level
- `get_dns_blocklist_status` — Cache status

**Extensions:**
- `list_extensions` — List extensions (requires cloud login + active subscription)
- `list_extension_groups` — List extension groups (requires cloud login + active subscription)
- `create_extension_group` — Create group (requires cloud login + active subscription)
- `delete_extension` — Delete extension (requires cloud login + active subscription)
- `delete_extension_group` — Delete extension group (requires cloud login + active subscription)
- `assign_extension_group_to_profile` — Assign group to profile (requires cloud login + active subscription)

**Cookies:**
- `import_profile_cookies` — Import cookies (JSON array or Netscape format)

**Team Lock:**
- `get_team_locks` — List active locks
- `get_team_lock_status` — Check profile lock status

**Synchronizer:**
- `start_sync_session` — Start leader/follower sync (requires cloud login + active subscription)
- `stop_sync_session` — Stop sync session
- `get_sync_sessions` — List active sessions
- `remove_sync_follower` — Remove follower from session

**Browser Interaction (all require cloud login + active subscription):**
- `navigate` — Navigate to URL
- `screenshot` — Take screenshot (png/jpeg/webp, optional full-page)
- `evaluate_javascript` — Execute JS in page context
- `click_element` — Click by CSS selector
- `type_text` — Type into input (human-like typing support)
- `get_page_content` — Get HTML or visible text
- `get_page_info` — Get URL, title, ready state
- `get_interactive_elements` — Enumerate clickable elements (indexed, token-efficient)
- `click_by_index` — Click by element index
- `type_by_index` — Type into element by index

---

## Proxy Server (Internal)

An internal SOCKS5/HTTP proxy server runs on a per-profile basis to route browser traffic through the configured proxy. Managed via `donut_proxy` binary, not exposed as an external API.

Features:
- SOCKS5 proxy protocol
- Proxy authentication forwarding
- DNS blocklist integration (ad/tracker blocking at DNS level)
- Traffic stats collection
- Bypass rules support

---

## WebSocket / CDP

When a profile is launched via `run_profile` (REST API) or `launch_browser_profile` (IPC), a **remote debugging port** (Chrome DevTools Protocol) is allocated. The port is returned in the response. Use this port with standard CDP clients (Puppeteer, Playwright, `chrome-remote-interface`) to automate the browser directly.
