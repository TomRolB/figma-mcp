# figma-mcp

Read-only MCP server for Figma design files. Wraps the Figma REST API, caching each file's
document tree and frame screenshots to disk on first use so repeat queries cost zero further
API calls — useful given how tight Figma's REST rate limits can be for non-Full seats.

Not tied to any one design file: every tool takes a `fileKey` argument, so one server instance
can be pointed at whatever Figma files a project needs.

## Install

Requires Node 18 or newer. No clone or build step — the package installs and compiles itself:

```bash
npx -y github:TomRolB/figma-mcp
```

Register it with your MCP client as a stdio server running that command.

**Claude Code:**

```bash
claude mcp add figma -- npx -y github:TomRolB/figma-mcp
```

**Any client that takes JSON** (`.mcp.json`, `mcp_config.json`, and similar):

```json
{
  "mcpServers": {
    "figma": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:TomRolB/figma-mcp"]
    }
  }
}
```

Deliberately no `env` block: not every MCP client expands `${VAR}` placeholders, and those that
don't will send the literal string as your token, producing a confusing `401`. Put the token in
an env file instead — see [Configuration](#configuration).

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

## Caching and API quota

`figma_refresh_cache` is the **only** tool that calls Figma; every other tool reads the local
cache, so run it first, and again whenever the design changes.

That keeps quota spend predictable. One refresh costs three metered REST calls (`/meta`,
`/files`, `/images`) no matter how many frames the file has, since the PNG downloads that follow
hit S3 rather than the API. A refresh that finds the file unchanged costs one.

Rate limits follow the plan of whoever **owns** the file, not your own plan. On a View or Collab
seat the cap is monthly and small enough to plan around; on a Full or Dev seat it is per-minute
and effectively not a constraint.

## Configuration

| Variable          | Required | Description                                                                 |
|--------------------|----------|-------------------------------------------------------------------------------|
| `FIGMA_API_TOKEN`  | refresh only | Personal access token, sent as the `X-Figma-Token` header. Resolved lazily, so a cache-only install starts and works without one — `figma_refresh_cache` is the only tool that needs it. |
| `FIGMA_CACHE_DIR`  | no       | Cache location. Defaults to `.figma-cache` under the server's working directory. |
| `FIGMA_ENV_FILE`   | no       | Env file location. Defaults to `.env` under the server's working directory.  |

Generate a token at **Figma → Settings → Security → Personal access tokens**, with at least
read access to *File content*.

Any of these may be supplied through the env file instead of the real environment, which is the
easiest setup: drop one line in `.env` next to your project and add it to `.gitignore`.

```
FIGMA_API_TOKEN=paste-token-here
```

A variable already present in the real environment wins over the file, so a shell export or a CI
secret still overrides a checked-out `.env`. `FIGMA_ENV_FILE` is the exception that has to come
from the real environment — it is not a secret, so a tracked MCP config can carry it while the
token stays in the ignored file.

Add `.figma-cache/` to `.gitignore` too. It holds full-resolution PNGs and grows quickly.

## Development

```bash
git clone https://github.com/TomRolB/figma-mcp
cd figma-mcp
npm install
npm run build           # tsc -> dist/
npm start
```

`npm run dev` runs `index.ts` directly via `tsx`, no build step, for iterating locally.

Widening what gets pre-exported is free — `/images` accepts any number of node ids in a single
call — so extend the frame-image download step rather than adding an on-demand fetch.
