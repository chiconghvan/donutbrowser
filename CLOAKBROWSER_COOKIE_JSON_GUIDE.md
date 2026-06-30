# CloakBrowser Cookie JSON Import/Export Guide

This document describes a practical way to add cookie import/export by JSON for a CloakBrowser-based profile system.

The goal is simple:
- export cookies from a profile into a JSON file
- import cookies from that JSON file back into the same profile
- keep the CloakBrowser profile path and fingerprint seed stable
- avoid mixing CloakBrowser storage with other browser engines

The pattern below matches the implementation style used in this repository:
- profile-specific browser settings are merged at runtime
- CloakBrowser gets its own profile directory
- cookie import/export uses Playwright-compatible `context.cookies()` / `context.add_cookies()`
- profile data is stored as JSON for easy editing and portability

## Recommended JSON format

Use a JSON array of cookie objects:

```json
[
  {
    "name": "sessionid",
    "value": "abc123",
    "domain": ".example.com",
    "path": "/",
    "expires": 1893456000,
    "httpOnly": true,
    "secure": true,
    "sameSite": "Lax"
  }
]
```

Minimum required fields:
- `name`
- `value`
- `domain`
- `path`

Optional fields:
- `expires`
- `httpOnly`
- `secure`
- `sameSite`

## Engine-specific profile layout

Keep CloakBrowser profiles separate from other engines.

Example:

```text
profiles/
  alice@example.com/
    cloakbrowser/
      cloakbrowser_fingerprint.json
      Cookies.json
```

The important part is that CloakBrowser gets its own profile root, so you do not accidentally write cookies into a Camoufox or Chromium profile folder.

## Export flow

Export should:
1. open the target profile with `launch_persistent_context_async`
2. load the correct fingerprint seed for that profile
3. read cookies from the active context
4. normalize them into a JSON array
5. write the JSON to disk

### Export logic

Use the context APIs first:

```python
state = await context.storage_state()
cookies = state.get("cookies", [])
more_cookies = await context.cookies()
```

Then normalize the cookie objects:

```python
def normalize_cookie(cookie: dict) -> dict:
    item = {
        "name": str(cookie.get("name") or "").strip(),
        "value": str(cookie.get("value") or ""),
        "domain": str(cookie.get("domain") or "").strip(),
        "path": str(cookie.get("path") or "/").strip() or "/",
    }

    for key in ("expires", "httpOnly", "secure", "sameSite"):
        if key in cookie:
            item[key] = cookie[key]

    return item
```

If you need persisted cookies that are not returned by the live context, you can add a best-effort fallback that reads browser cookie DB files directly, but keep that optional. For most workflows, the live context is enough.

## Import flow

Import should:
1. read and parse a JSON file
2. validate that the top-level value is a list
3. open the correct CloakBrowser profile context
4. clear current cookies
5. add cookies from the JSON file
6. close the browser cleanly

### Import logic

```python
import json

with open(cookie_json_path, "r", encoding="utf-8") as f:
    cookies = json.load(f)

if not isinstance(cookies, list):
    raise ValueError("Cookies JSON must be an array")
```

Normalize before import:

```python
def clean_cookie(cookie: dict) -> dict | None:
    name = str(cookie.get("name") or "").strip()
    value = str(cookie.get("value") or "")
    domain = str(cookie.get("domain") or "").strip()
    path = str(cookie.get("path") or "/").strip() or "/"

    if not name or not domain:
        return None

    item = {
        "name": name,
        "value": value,
        "domain": domain,
        "path": path,
    }

    for key in ("expires", "httpOnly", "secure", "sameSite"):
        if key in cookie:
            item[key] = cookie[key]

    return item
```

Then apply it to the live context:

```python
await context.clear_cookies()
payload = []

for cookie in cookies:
    if not isinstance(cookie, dict):
        continue
    item = clean_cookie(cookie)
    if item:
        payload.append(item)

if payload:
    await context.add_cookies(payload)
```

## CloakBrowser-specific fingerprint handling

For CloakBrowser, keep a stable per-profile fingerprint seed:

```python
seed = load_or_create_cloakbrowser_seed(profile_root)
ctx = await launch_persistent_context_async(
    str(user_data_dir),
    headless=True,
    args=[f"--fingerprint={seed}"],
)
```

This matters because the cookie import/export should operate on the same profile identity every time. If the fingerprint seed changes unexpectedly, the profile can look like a different browser instance.

## Suggested helper structure

If you are adding this to another project, I recommend these helpers:

```python
def load_or_create_cloakbrowser_seed(profile_dir: Path) -> int:
    ...

def cloakbrowser_profile_dir(profile_dir: Path) -> Path:
    return Path(profile_dir) / "cloakbrowser"

async def export_cookies_to_json(profile_name: str, output_path: Path) -> None:
    ...

async def import_cookies_from_json(profile_name: str, input_path: Path) -> None:
    ...
```

## UI wiring

If your app has a profile editor, expose two actions:
- `Export Cookies`
- `Import Cookies`

Typical flow:
- Export button opens a save-file dialog and writes `Cookies.json`
- Import button opens a file picker, reads the JSON, and applies it to the profile

If you already have a profile JSON editor, a direct text-area approach also works:
- `Refresh` reads cookies into JSON text
- `Save` parses JSON text and writes cookies back

## Validation rules

Keep validation strict enough to avoid malformed imports:
- reject non-array JSON
- skip entries missing `name` or `domain`
- default `path` to `/`
- tolerate missing optional fields
- preserve `expires`, `secure`, `httpOnly`, `sameSite` when present

## Practical notes

- Use `launch_persistent_context_async(...)` for import/export so cookies are attached to the real profile storage.
- If you need a one-shot browser window, you can still export via the live context and then close it.
- Keep CloakBrowser cookie storage isolated from other engines.
- Prefer JSON over CSV because it preserves typed fields like `expires` and `sameSite`.

## Minimal implementation checklist

1. Add a `cloakbrowser` profile directory helper.
2. Add a stable fingerprint seed loader.
3. Implement cookie export as JSON from the live context.
4. Implement cookie import from JSON into the live context.
5. Wire import/export buttons into the profile UI.
6. Save and restore cookies only for the active engine.

## Example end-to-end pseudocode

```python
async def export_profile_cookies(profile_name: str, output_path: Path) -> None:
    profile_root = profile_dir_for_email(profile_name)
    user_data_dir = cloakbrowser_profile_dir(profile_root)
    seed = load_or_create_cloakbrowser_seed(profile_root)

    ctx = await launch_persistent_context_async(
        str(user_data_dir),
        headless=True,
        args=[f"--fingerprint={seed}"],
    )
    try:
        cookies = []
        try:
            state = await ctx.storage_state()
            cookies.extend(state.get("cookies", []))
        except Exception:
            pass

        try:
            cookies.extend(await ctx.cookies())
        except Exception:
            pass

        normalized = []
        for cookie in cookies:
            if not isinstance(cookie, dict):
                continue
            item = clean_cookie(cookie)
            if item:
                normalized.append(item)

        output_path.write_text(
            json.dumps(normalized, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    finally:
        await ctx.close()
```

```python
async def import_profile_cookies(profile_name: str, input_path: Path) -> None:
    cookies = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(cookies, list):
        raise ValueError("Cookies JSON must be an array")

    profile_root = profile_dir_for_email(profile_name)
    user_data_dir = cloakbrowser_profile_dir(profile_root)
    seed = load_or_create_cloakbrowser_seed(profile_root)

    ctx = await launch_persistent_context_async(
        str(user_data_dir),
        headless=True,
        args=[f"--fingerprint={seed}"],
    )
    try:
        await ctx.clear_cookies()

        payload = []
        for cookie in cookies:
            if not isinstance(cookie, dict):
                continue
            item = clean_cookie(cookie)
            if item:
                payload.append(item)

        if payload:
            await ctx.add_cookies(payload)
    finally:
        await ctx.close()
```

## Notes for porting to another project

If your target project already has a browser abstraction, place the CloakBrowser-specific code behind a branch like:

```python
if engine == "cloakbrowser":
    ...
```

That keeps the import/export feature isolated and prevents cross-engine regressions.
