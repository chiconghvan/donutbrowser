---
name: donutbrowser-deploy
description: Deploy donutbrowser project to GitHub — bump version, update CHANGELOG, commit, tag, push, create GitHub Release. Only applies when user says "deploy donutbrowser", "release donutbrowser", "publish donutbrowser", or mentions creating a versioned release.
---

# Donut Browser — Deploy to GitHub

Triển khai release mới lên GitHub: bump version, update CHANGELOG, commit, tag, push, và tạo GitHub Release.

## Flow

### 1. Check trạng thái hiện tại

```bash
git status
git diff
git log --oneline -5
git tag -l "v0.27.*" --sort=-v:refname
```

### 2. Hỏi user version mới

Lấy version hiện tại từ `package.json`. Hỏi user version mới (mặc định: patch bump, vd `0.27.15` → `0.27.16`).

### 3. Bump version ở 3 files

```bash
# package.json — "version": "x.y.z"
# src-tauri/Cargo.toml — version = "x.y.z"
# src-tauri/tauri.conf.json — "version": "x.y.z"
```

Dùng `edit` tool để sửa từng file.

### 4. Update CHANGELOG.md

Thêm entry mới ngay sau title `# Changelog`:

```markdown
## vX.Y.Z (YYYY-MM-DD)

### Bug Fixes

- ...

### Features

- ...

### Maintenance

- chore: bump version to X.Y.Z
```

Tham khảo `git diff CHANGELOG.md` và `git diff` các file khác để biết nội dung change log. Định dạng theo chuẩn có sẵn trong file.

### 5. Commit, tag, push

```bash
git add -A
git commit -m "release: vX.Y.Z

<dòng changelog viết lại thành commit-style, vd:
- fix Cloak fingerprint tab not showing in profile info dialog
- remove unused APPLE_SIGNING_IDENTITY secret from release workflow
- chore: bump version to X.Y.Z>"
git tag vX.Y.Z
git push origin main --tags
```

Commit message gồm:
- Dòng 1: `release: vX.Y.Z` (subject)
- Dòng 3+: các mục changelog ở dạng `- <verb>: <mô tả>` (body), giống hệt changelog nhưng bỏ section headers (`### Bug Fixes` / `### Features` / `### Maintenance`)

### 6. Tạo GitHub Release

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "<nội dung changelog>"
```

### 7. Xác nhận

Trả về URL release: `https://github.com/chiconghvan/donutbrowser/releases/tag/vX.Y.Z`

## Files cần bump version

| File | Field |
|---|---|
| `package.json` | `version` |
| `src-tauri/Cargo.toml` | `version` |
| `src-tauri/tauri.conf.json` | `version` |

## Quy tắc CHANGELOG

- Format: `## vX.Y.Z (YYYY-MM-DD)` → `### Bug Fixes` / `### Features` / `### Maintenance`
- Mỗi mục là `- ` + mô tả ngắn gọn
- Luôn có `- chore: bump version to X.Y.Z` ở mục Maintenance
- Tham khảo commit messages và diff để viết changelog

## Lưu ý

- **Luôn** confirm version với user trước khi bump
- `git add -A` để stage tất cả (kể cả file ngoài ý muốn — user đã yêu cầu)
- Push tag có thể bị reject nếu tag đã tồn tại trên remote — đó là expected, không sao
- Nếu `gh` chưa auth, chạy `gh auth login` trước
