# figma-mcp

Read-only MCP server for Figma design files. Wraps the Figma REST API, caching each file's
document tree and frame screenshots to disk on first use so repeat queries cost zero further
API calls — useful given how tight Figma's REST rate limits can be for non-Full seats.

Not tied to any one design file: every tool takes a `fileKey` argument, so one server instance
can be pointed at whatever Figma files a project needs.

## Tools

| Tool                  | Purpose                                                              | Output                     |
|------------------------|-----------------------------------------------------------------------|-----------------------------|
| `figma_refresh_cache`  | Pull a file's tree + frame screenshots into the cache. No-op if unchanged since last refresh (checked via a cheap `/meta` call), unless `force` is set. | Summary text |
| `figma_list_frames`    | List cached top-level frames (screens) with node id, page, size.     | One line per frame          |
| `figma_get_screen`     | Full semantic outline of one frame: node ids, layout, fills/strokes (including non-solid paints like IMAGE/GRADIENT_*), blur/shadow effects, corner radius, full (untruncated) text content. Not generated code — geometry and style facts only. | Indented outline text |
| `figma_get_palette`    | Distinct solid colors used in a file or one frame's subtree, most-used first. | One line per color |
| `figma_export_image`   | Local file path of a node's rendered PNG. Cache-only — `figma_refresh_cache` pre-exports top-level frames, and a node with no cached PNG is an error rather than a fetch. | File path |
| `figma_find_nodes`     | Search the cached tree by name substring, exact type, or text content — for locating a node id (e.g. an image-fill layer excluded from a sibling's outline) without inspecting the tree by hand. | One line per match |
| `figma_query`          | Run a real **jq** filter against the file's cached raw JSON — the escape hatch for anything the above don't expose (raw paint objects, per-corner radii, arbitrary field combos). The tool description documents the input shape and gives example filters, so the first call can be targeted rather than exploratory. | JSON |

`figma_refresh_cache` is the **only** tool that calls Figma; every other tool reads the local
cache, so run it first (and again whenever the design changes). That keeps quota spend
predictable: one refresh costs three metered REST calls (`/meta`, `/files`, `/images`) no matter
how many frames the file has, since the PNG downloads that follow hit S3 rather than the API. A
refresh that finds the file unchanged costs one. On a View/Collab seat capped at 6 calls/month
that is two full refreshes; on a Full/Dev seat the limit is per-minute instead and effectively
not a constraint.

Widening what gets pre-exported is free — `/images` takes any number of node ids in a single
call — so `downloadFrameImages` is the place to add coverage, never an on-demand fetch.

## Configuration

| Variable          | Required | Description                                                                 |
|--------------------|----------|-------------------------------------------------------------------------------|
| `FIGMA_API_TOKEN`  | refresh only | Personal access token, sent as the `X-Figma-Token` header. Resolved lazily, so a cache-only install starts and works without one — `figma_refresh_cache` is the only tool that needs it. |
| `FIGMA_CACHE_DIR`  | no       | Cache location. Defaults to `.figma-cache` under the server's working directory. |
| `FIGMA_ENV_FILE`   | no       | Env file location. Defaults to `.env` under the server's working directory.  |

Any of these may be supplied through the env file instead of the real environment, which is the
easiest setup: drop one line in `.env` next to your project and add it to `.gitignore`.

```
FIGMA_API_TOKEN=paste-token-here
```

A variable already present in the real environment wins over the file, so a shell export or a CI
secret still overrides a checked-out `.env`. `FIGMA_ENV_FILE` is the exception that has to come
from the real environment — it is not a secret, so a tracked MCP config can carry it while the
token stays in the ignored file.

Token expiry is whatever you set when generating it in Figma's account settings — there's no
enforced maximum, but rotate it if it's ever been pasted somewhere it shouldn't (chat, a shared
terminal, etc.).

## Register globally

Run this yourself so the token stays out of the assistant's context (substitute your real
token). On **Windows PowerShell**, keep it one line with no `--` separator:

```powershell
claude mcp add figma node C:/Users/tomas/projects/austral/mcp/figma/dist/index.js -e FIGMA_API_TOKEN=paste-token-here -s user
```

Verify with `claude mcp list` — it should show `figma` as Connected. **Restart Claude Code**
before the `mcp__figma__*` tools become callable in a session.

## Development

```bash
npm install
npm run build   # tsc -> dist/
FIGMA_API_TOKEN=... npm start
```

`npm run dev` runs `index.ts` directly via `tsx`, no build step, for iterating locally.
