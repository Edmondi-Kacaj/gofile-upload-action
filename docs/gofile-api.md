# Gofile API usage in this Action

Reference: [https://gofile.io/api](https://gofile.io/api)

## Authentication

Send the account token as:

```
Authorization: Bearer <token>
```

Omit the token for **guest** uploads. The first upload response then includes `guestToken`; the client reuses it for later calls in the same run.

## Endpoints we call

### Accounts

| Call | When |
|------|------|
| `GET /accounts/getid` | Resolve account id from token |
| `GET /accounts/{id}` | Read `rootFolder`, tier, etc. |
| `POST /accounts` | Optional explicit guest account creation |

### Upload

```
POST https://upload.gofile.io/contents/uploadfile
Content-Type: multipart/form-data
  file: <binary>
  folderId: <uuid>   # optional
```

Regional hosts: `upload-eu-par`, `upload-na-phx`, `upload-na-nyc`, `upload-ap-sgp`, `upload-ap-hkg`, `upload-ap-tyo`, `upload-ap-syd`, `upload-sa-sao`.

### Folders & attributes

| Call | Purpose |
|------|---------|
| `POST /contents/createFolder` | Create folder under `parentFolderId` |
| `PUT /contents/{id}/update` | Set `public`, `password`, `expiry`, `name`, … |

### Other (available on `GofileClient`, not all wired to Action inputs)

- `DELETE /contents` — delete by UUID list  
- `PUT /contents/move` / `POST /contents/copy` — Premium  
- `GET /contents/{id}` / `GET /contents/search` — Premium  
- `POST|DELETE …/directlinks` — Premium direct links  

## Error status strings

| Status | Meaning | Retried? |
|--------|---------|----------|
| `error-token` | Missing/invalid token | No |
| `error-notPremium` | Needs Premium | No |
| `error-rateLimit` | Too many requests | **Yes** |
| `error-limits` | Quota exceeded | No |
| `error-notFound` | Unknown content | No |
| `error-owner` / `error-notOwner` | Not your content | No |

HTTP `429` and `5xx` are also retried with exponential backoff.
