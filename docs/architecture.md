# Architecture

This Action uploads files to **Gofile.io**. The code is organised so the Gofile REST client is easy to read and reuse in other projects.

```
src/
  index.ts          # GitHub Action entry — inputs, outputs, high-level flow
  glob.ts           # Path matching (@actions/glob)
  archive.ts        # Optional zip / tar.gz
  upload.ts         # Step-by-step upload orchestration + logging
  gofile/
    api.ts          # GofileClient — one method per API endpoint
    http.ts         # fetch wrapper (retry only 429 / 5xx)
    types.ts        # Response shapes from the Gofile API
```

## Flow

```
inputs → glob → archive → resolve folder → upload → set access → outputs
```

Each phase is logged with `core.startGroup` / `core.info` so the workflow log shows:

0. Read inputs  
1. Resolve destination folder  
2. Create folder (if needed)  
3. Upload files  
4. Apply access settings  
5. Set outputs  

## Parent folder resolution

1. If `folder-id` input is set → use it.  
2. Else if a token is present → `GET /accounts/getid` then `GET /accounts/{id}` and use `rootFolder`.  
3. Else (guest) → first upload creates an account; reuse `parentFolder` + `guestToken` for the rest.

## HTTP & errors

`HttpClient` retries **only** when:

- HTTP status is `429` or `>= 500`
- Gofile status is `error-rateLimit`
- A network failure occurs

All other errors (bad token, not found, validation, …) fail immediately with a clear `GofileError` message.

## Gofile API surface (`GofileClient`)

| Method | Endpoint |
|--------|----------|
| `getAccountId` | `GET /accounts/getid` |
| `getAccount` | `GET /accounts/{id}` |
| `getRootFolderId` | helper over the two above |
| `createGuestAccount` | `POST /accounts` |
| `createFolder` | `POST /contents/createFolder` |
| `uploadFile` | `POST https://upload*.gofile.io/contents/uploadfile` |
| `updateContent` | `PUT /contents/{id}/update` |
| `deleteContents` | `DELETE /contents` |
| `moveContents` | `PUT /contents/move` (Premium) |
| `copyContents` | `POST /contents/copy` (Premium) |
| `getContent` | `GET /contents/{id}` (Premium listings) |
| `search` | `GET /contents/search` (Premium) |
| `createDirectLink` | `POST /contents/{id}/directlinks` (Premium) |
| `deleteDirectLink` | `DELETE /contents/{id}/directlinks/{linkId}` |

Official reference: https://gofile.io/api

## Reusing this layout elsewhere

If you build a similar Action for another service, keep the same split:

- `*/http.ts` — transport + retry policy  
- `*/api.ts` — one function per endpoint, with log lines  
- `upload.ts` (or equivalent) — orchestration only, no raw URLs  
- `index.ts` — Action I/O only  

You do not need a shared “provider interface”; copy the pattern and rename the client.
