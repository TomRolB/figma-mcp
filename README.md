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
| `figma_export_image`   | Local file path of a node's rendered PNG (cached, downloaded on demand if not yet cached). | File path |
| `figma_find_nodes`     | Search the cached tree by name substring, exact type, or text content — for locating a node id (e.g. an image-fill layer excluded from a sibling's outline) without inspecting the tree by hand. | One line per match |
| `figma_query`          | Run a real **jq** filter against the file's cached raw JSON — the escape hatch for anything the above don't expose (raw paint objects, per-corner radii, arbitrary field combos). The tool description documents the input shape and gives example filters, so the first call can be targeted rather than exploratory. | JSON |

`figma_list_frames`, `figma_get_screen`, `figma_get_palette`, `figma_find_nodes`, and
`figma_query` read only from the local cache — run `figma_refresh_cache` first (and again
whenever the design changes).

## Configuration

| Variable          | Required | Description                                                                 |
|--------------------|----------|-------------------------------------------------------------------------------|
| `FIGMA_API_TOKEN`  | yes      | Personal access token, sent as the `X-Figma-Token` header.                   |
| `FIGMA_CACHE_DIR`  | no       | Cache location. Defaults to `.figma-cache` under the server's working directory. |

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
