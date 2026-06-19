# Project

Donut Browser desktop app. Tauri/Rust backend + Next/React frontend. Manages anti-detect browser profiles, fingerprints, proxy/VPN routing, sync, MCP/API automation, extensions, cookies, and traffic stats.

Current active work: migrate profile networking from stored `proxy_id` references to inline profile proxy strings.

# Current Architecture

- Rust backend under `src-tauri/src` owns profile persistence, browser launch, proxy/VPN workers, sync, API server, MCP server, and platform integration.
- Frontend under `src` owns profile table/dialogs, settings, proxy/VPN UI, sync UI, and browser workflow UX.
- Profile metadata lives per profile as `metadata.json` under profile UUID directories.
- `BrowserProfile.proxy` is target inline proxy field using canonical `address:port:user:pass` format.
- Legacy `proxy_id` metadata is deserialized via serde alias into `proxy` and migrated during profile listing.
- Browser launch parses `profile.proxy` into `ProxySettings`, then starts local `donut-proxy` worker. Browser receives local proxy, not upstream proxy directly.
- VPN remains separate via `vpn_id`; proxy and VPN remain mutually exclusive.
- Sync treats proxy as profile metadata. Browser files sync separately via manifest.
- Stored proxy manager still exists for proxy picker/import/export/runtime compatibility, but profile source of truth is moving to inline proxy.

# TODO

- Finish removing stored proxy dependency from UI where possible.
- Replace proxy picker UX with direct inline proxy input (`address:port:user:pass`) in create/edit/bulk assignment flows.
- Decide whether stored proxy import/export remains as helper-only feature or gets removed entirely.
- Remove/trim stored proxy sync surface if no longer needed.
- Audit MCP/API docs and schemas for `proxy_id` remnants; keep only explicit compatibility aliases where needed.
- Add tests for legacy `proxy_id` migration:
  - resolves existing stored proxy to inline string
  - clears missing stored proxy ID
  - keeps already-inline proxy unchanged
- Add tests for inline proxy parser validation.
- Run full `cargo clippy --all-targets --all-features -- -D warnings -D clippy::all` when permission allows.
- Run app manually: create/edit profile with inline proxy, confirm metadata has `proxy` and no `proxy_id`, launch Wayfern/Camoufox through local proxy.

# Decisions

- Profile networking source of truth is `BrowserProfile.proxy`, not stored proxy ID.
- Canonical proxy format is `address:port:user:pass`.
- Inline proxy parser defaults `proxy_type = "http"`.
- Invalid inline proxy should fail validation/update rather than launch with broken settings.
- Legacy `proxy_id` is compatibility-only; after successful migration, saved metadata should use `proxy` only.
- Browser launch always uses local `donut-proxy` worker; upstream proxy never goes straight into browser config except transient fingerprint generation.
- Proxy and VPN are mutually exclusive; setting one clears the other.
- Sync should not sync stored proxy entities because profiles carry proxy string inline.
