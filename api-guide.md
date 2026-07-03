# Donut Browser API Guide v0.27.23

## Overview

Donut Browser exposes 3 local API layers:

| Layer | Port | Protocol | Auth | Purpose |
|-------|------|----------|------|---------|
| REST API | `10108` | HTTP / Axum | None | External automation via HTTP |
| MCP API | `51080` | HTTP JSON-RPC / MCP | Bearer token or URL token | AI agent integration |
| Tauri IPC | in-process | `invoke()` / `emit()` / `listen()` | In-app | Frontend <-> backend |

Notes:

- REST API is local only on `127.0.0.1`.
- REST auth is removed. No `Authorization` header needed.
- Some handlers still require paid cloud login or active subscription at runtime.
- API port can fall back if `10108` is busy.

Base URL:

```text
http://127.0.0.1:10108/v1
```

## Endpoints

### Profiles

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/profiles` | List profiles |
| `GET` | `/v1/profiles/{id}` | Get profile |
| `POST` | `/v1/profiles` | Create profile |
| `PUT` | `/v1/profiles/{id}` | Update profile |
| `DELETE` | `/v1/profiles/{id}` | Delete profile |
| `GET` | `/v1/profiles/{id}/run` | Launch profile |
| `POST` | `/v1/profiles/{id}/open-url` | Open URL in running profile |
| `POST` | `/v1/profiles/{id}/kill` | Kill profile browser |
| `POST` | `/v1/profiles/{id}/cookies/import` | Import cookies |

### Groups

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/groups` | List groups |
| `GET` | `/v1/groups/{id}` | Get group |
| `POST` | `/v1/groups` | Create group |
| `PUT` | `/v1/groups/{id}` | Update group |
| `DELETE` | `/v1/groups/{id}` | Delete group |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/tags` | List all tags |

### Proxies

Stored proxy CRUD is deprecated.

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/v1/proxies` | Returns empty list |
| `GET` | `/v1/proxies/{id}` | Returns `404` |
| `POST` | `/v1/proxies` | Returns `410 Gone` |
| `PUT` | `/v1/proxies/{id}` | Returns `410 Gone` |
| `DELETE` | `/v1/proxies/{id}` | Returns `410 Gone` |

### Extensions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/extensions` | List extensions |
| `GET` | `/v1/extension-groups` | List extension groups |
| `DELETE` | `/v1/extensions/{id}` | Delete extension |
| `DELETE` | `/v1/extension-groups/{id}` | Delete extension group |

### Browsers

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/browsers/download` | Download browser binary |
| `GET` | `/v1/browsers/{browser}/versions` | List available versions |
| `GET` | `/v1/browsers/{browser}/versions/{version}/downloaded` | Check downloaded status |

### Utility

| Path | Description |
|------|-------------|
| `/openapi.json` | Full OpenAPI spec |
| `/v1/openapi.json` | v1 OpenAPI spec |

## Request / Response Shapes

### `GET /v1/profiles`

Response:

```json
{
  "profiles": [
    {
      "id": "uuid",
      "name": "My Profile",
      "browser": "camoufox",
      "version": "135.0.1-beta.24",
      "proxy": "http://user:pass@host:port",
      "launch_hook": null,
      "process_id": null,
      "last_launch": null,
      "release_type": "stable",
      "camoufox_config": null,
      "wayfern_config": null,
      "cloak_config": null,
      "group_id": null,
      "tags": ["social", "us"],
      "is_running": false,
      "proxy_bypass_rules": []
    }
  ],
  "total": 1
}
```

### `GET /v1/profiles/{id}`

Response:

```json
{
  "profile": {
    "id": "uuid",
    "name": "My Profile",
    "browser": "camoufox",
    "version": "135.0.1-beta.24",
    "proxy": null,
    "launch_hook": null,
    "process_id": null,
    "last_launch": null,
    "release_type": "stable",
    "camoufox_config": null,
    "wayfern_config": null,
    "cloak_config": null,
    "group_id": null,
    "tags": [],
    "is_running": false,
    "proxy_bypass_rules": []
  }
}
```

### `POST /v1/profiles`

Request:

```json
{
  "name": "My Profile",
  "browser": "camoufox",
  "version": "latest",
  "proxy": "http://user:pass@host:port",
  "launch_hook": null,
  "release_type": "stable",
  "camoufox_config": null,
  "wayfern_config": null,
  "cloak_config": null,
  "group_id": null,
  "tags": ["social", "us"]
}
```

Notes:

- `browser` must be `camoufox` or `cloak`.
- `version` is optional. Omit it, pass `"latest"`, or pass empty string to use newest downloaded version.
- `camoufox_config` is used only with `camoufox`.
- `wayfern_config` is used only with `wayfern`.
- `cloak_config` is used only with `cloak`.

Response: `ApiProfileResponse`

```json
{
  "profile": {
    "id": "uuid",
    "name": "My Profile",
    "browser": "camoufox",
    "version": "135.0.1-beta.24",
    "proxy": "http://user:pass@host:port",
    "launch_hook": null,
    "process_id": null,
    "last_launch": null,
    "release_type": "stable",
    "camoufox_config": null,
    "wayfern_config": null,
    "cloak_config": null,
    "group_id": null,
    "tags": ["social", "us"],
    "is_running": false,
    "proxy_bypass_rules": []
  }
}
```

### `PUT /v1/profiles/{id}`

Request fields are all optional:

```json
{
  "name": "Renamed",
  "version": "136.0.0",
  "proxy": "http://user:pass@host:port",
  "launch_hook": "https://example.com/hook",
  "release_type": "stable",
  "camoufox_config": {"fingerprint": "..."},
  "cloak_config": {"fingerprint": "..."},
  "group_id": "group-uuid",
  "tags": ["new-tag"],
  "extension_group_id": "ext-group-uuid",
  "proxy_bypass_rules": ["*.local", "10.0.0.0/8"]
}
```

Notes:

- Empty `launch_hook` clears hook.
- Empty `extension_group_id` clears extension group.
- `camoufox_config` and `cloak_config` must be valid JSON objects for their browser type.

Response: `ApiProfileResponse`

### `GET /v1/profiles/{id}/run`

Query params:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | No | URL to open after launch |
| `headless` | boolean | No | Launch headless |

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

### `POST /v1/profiles/{id}/open-url`

Request:

```json
{
  "url": "https://example.com"
}
```

Response: `200 OK` with empty body.

### `POST /v1/profiles/{id}/kill`

Response: `204 No Content`

### `POST /v1/profiles/{id}/cookies/import`

Request:

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

### `GET /v1/groups`

Response:

```json
[
  {
    "id": "group-uuid",
    "name": "Shopping",
    "profile_count": 4
  }
]
```

### `GET /v1/groups/{id}`

Response:

```json
{
  "id": "group-uuid",
  "name": "Shopping",
  "profile_count": 4
}
```

### `POST /v1/groups`

Request:

```json
{
  "name": "Shopping"
}
```

Response:

```json
{
  "id": "group-uuid",
  "name": "Shopping",
  "profile_count": 0
}
```

### `PUT /v1/groups/{id}`

Request:

```json
{
  "name": "New Group Name"
}
```

Response:

```json
{
  "id": "group-uuid",
  "name": "New Group Name",
  "profile_count": 0
}
```

### `DELETE /v1/groups/{id}`

Response: `204 No Content`

### `GET /v1/proxies`

Response: `[]`

### `GET /v1/proxies/{id}`

Response: `404 Not Found`

### `POST /v1/proxies`

Response: `410 Gone`

### `GET /v1/extensions`

Response: list of extension records from backend.

### `GET /v1/extension-groups`

Response: list of extension-group records from backend.

### `DELETE /v1/extensions/{id}`

Response: `204 No Content`

### `DELETE /v1/extension-groups/{id}`

Response: `204 No Content`

### `POST /v1/browsers/download`

Request:

```json
{
  "browser": "camoufox",
  "version": "135.0.1-beta.24"
}
```

Response:

```json
{
  "browser": "camoufox",
  "version": "135.0.1-beta.24",
  "status": "downloaded"
}
```

### `GET /v1/browsers/{browser}/versions`

Response:

```json
[
  "135.0.1-beta.24",
  "135.0.1-beta.23"
]
```

### `GET /v1/browsers/{browser}/versions/{version}/downloaded`

Response:

```json
true
```

## Error Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `204` | Success, no body |
| `400` | Bad request |
| `402` | Paid plan required for runtime-restricted actions |
| `404` | Not found |
| `409` | Conflict |
| `410` | Gone / deprecated stored-proxy route |
| `500` | Internal server error |

## Notes

- OpenAPI spec lives at `/openapi.json` and `/v1/openapi.json`.
- `ApiProfile` fields are `proxy`, `launch_hook`, `process_id`, `last_launch`, `release_type`, `camoufox_config`, `wayfern_config`, `cloak_config`, `group_id`, `tags`, `is_running`, `proxy_bypass_rules`.
- `UpdateProfileRequest` accepts `extension_group_id` and `proxy_bypass_rules`.
- `vpn_id` is not part of REST API profile schema.
