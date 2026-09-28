# Upload to Gofile.io

[![CI](https://github.com/Edmondi-Kacaj/gofile-upload-action/actions/workflows/ci.yml/badge.svg)](https://github.com/Edmondi-Kacaj/gofile-upload-action/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

GitHub Action that uploads files or folders to [Gofile.io](https://gofile.io).

- Guest uploads (no account) or authenticated with an API token  
- Optional zip / tar.gz compression  
- Password, expiry, public/private folders  
- Regional upload endpoints  
- Clear step-by-step logs in the workflow run  

---

## Quick start

```yaml
- name: Upload to Gofile
  uses: Edmondi-Kacaj/gofile-upload-action@v1
  id: gofile
  with:
    path: dist/**
    # token: ${{ secrets.GOFILE_TOKEN }}   # optional

- run: echo "Download → ${{ steps.gofile.outputs.download-page }}"
```

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `path` | **yes** | — | File, directory, or glob (multi-line; `!` exclusions). |
| `folder-name` | no | repository name | Folder name on Gofile. |
| `name` | no | same as `folder-name` | Archive base name. |
| `token` | no | — | Gofile API token. Omit for guest. |
| `folder-id` | no | account root | Existing folder UUID. If omitted, the account root is resolved automatically. |
| `compression` | no | `auto` | `auto` \| `none` \| `zip` \| `tar.gz` |
| `compression-level` | no | `6` | 0–9 |
| `if-no-files-found` | no | `warn` | `warn` \| `error` \| `ignore` |
| `include-hidden-files` | no | `false` | Include dotfiles. |
| `region` | no | `auto` | `auto` \| `eu-par` \| `na-phx` \| `na-nyc` \| `ap-sgp` \| `ap-hkg` \| `ap-tyo` \| `ap-syd` \| `sa-sao` |
| `access` | no | `public` | `public` \| `private` \| `password` |
| `public` | no | `true` | Legacy: `false` → private. |
| `password` | no | — | Folder password (4–100 chars). |
| `expiry` | no | — | Unix timestamp or `7d` / `24h` / `30m`. |
| `working-directory` | no | `.` | Base directory for paths. |
| `max-retries` | no | `3` | Retries on 429 / 5xx only. |
| `initial-retry-delay-ms` | no | `1000` | Backoff base (ms). |

## Outputs

| Output | Description |
|--------|-------------|
| `download-page` / `share-url` | Download page URL |
| `code` | Folder share code |
| `file-id` | Primary file UUID |
| `parent-folder` | Folder UUID |
| `parent-folder-code` | Folder share code |
| `folder-name` | Folder name used |
| `guest-token` | Guest token (masked) when no token was given |
| `size` | Total bytes |
| `md5` | Primary file MD5 |
| `is-public` | `true` / `false` |
| `access` | Final access mode |
| `direct-link` | Direct URL when present |
| `file-count` | Number of files uploaded |

---

## Examples

**Guest**

```yaml
- uses: Edmondi-Kacaj/gofile-upload-action@v1
  with:
    path: |
      build/**
      !build/**/*.map
```

**Token + password + expiry**

```yaml
- uses: Edmondi-Kacaj/gofile-upload-action@v1
  with:
    path: release/*
    token: ${{ secrets.GOFILE_TOKEN }}
    folder-name: ${{ github.ref_name }}
    access: password
    password: ${{ secrets.SHARE_PASSWORD }}
    expiry: 7d
    compression: zip
```

**Existing folder**

```yaml
- uses: Edmondi-Kacaj/gofile-upload-action@v1
  with:
    path: report.pdf
    token: ${{ secrets.GOFILE_TOKEN }}
    folder-id: ${{ secrets.GOFILE_FOLDER_ID }}
    compression: none
```

---

## How it works

1. Match `path` globs.  
2. Optionally compress (`auto` zips when more than one path matches).  
3. Resolve destination: `folder-id`, or account **root folder**, or guest on first upload.  
4. Create `folder-name` under that parent when set.  
5. Upload files; adopt `guestToken` if Gofile returns one.  
6. Apply password / expiry / private.  
7. Export outputs.

Workflow logs use collapsible groups for each step so failures are easy to locate.

More detail: [docs/architecture.md](docs/architecture.md) · [docs/gofile-api.md](docs/gofile-api.md)

---

## Development

```bash
npm ci
npm run lint
npm test
npm run build   # → dist/index.js
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — [LICENSE](LICENSE).
