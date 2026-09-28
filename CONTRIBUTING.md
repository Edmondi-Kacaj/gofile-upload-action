# Contributing

## Setup

```bash
git clone https://github.com/Edmondi-Kacaj/gofile-upload-action.git
cd gofile-upload-action
npm ci
npm run lint
npm test
npm run build
```

Node.js **20+** required. A [dev container](.devcontainer) is available.

## Layout

See [docs/architecture.md](docs/architecture.md) and [docs/gofile-api.md](docs/gofile-api.md).

- `src/gofile/api.ts` — Gofile REST methods (add new endpoints here)
- `src/gofile/http.ts` — transport + retry policy
- `src/upload.ts` — orchestration and logging
- `src/index.ts` — Action inputs/outputs only

## Pull requests

1. Branch from `main`.
2. Add or update tests under `__tests__/`.
3. Run `npm run all` before opening the PR.
4. Update README / docs if inputs, outputs, or behaviour change.

## Issues

Include Action version, a minimal workflow snippet, and the relevant log group from the failed run.
