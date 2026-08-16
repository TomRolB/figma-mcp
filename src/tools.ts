import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaCache } from "./cache.js";
import type { FigmaClient } from "./figmaClient.js";
import type { FigmaNode } from "./figmaTypes.js";
import { runJqFilter } from "./jqQuery.js";
import { collectPalette, findNode, findNodes, listFrames } from "./nodeTree.js";
import { cachedImagePath, refreshCache } from "./refresh.js";
import {
  formatFrameList,
  formatNodeMatches,
  formatPalette,
  formatQueryResult,
  formatRefreshResult,
  formatScreen,
} from "./responses.js";

interface Dependencies {
  client: FigmaClient;
  cache: FigmaCache;
}

const textResult = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

const fileKeyField = z.string().describe("Figma file key from its URL, e.g. 'abc123XYZ' in figma.com/design/abc123XYZ/My-File.");

const nodeIdField = (description: string) => z.string().describe(description);

const loadCachedDocument = async (cache: FigmaCache, fileKey: string): Promise<FigmaNode> => {
  const file = await cache.readFile(fileKey);
  if (!file) {
    throw new Error(`No cache for file ${fileKey} yet. Run figma_refresh_cache first.`);
  }
  return file.document;
};

const registerRefreshCache = (server: McpServer, { client, cache }: Dependencies) =>
  server.tool(
    "figma_refresh_cache",
    "Pull a Figma file's full design tree and frame screenshots into the local cache. Cheap no-op if nothing changed since the last refresh; pass force to always re-pull.",
    {
      fileKey: fileKeyField,
      force: z.boolean().optional().describe("Re-fetch even if the file hasn't changed remotely (default false)."),
    },
    async ({ fileKey, force }) => textResult(formatRefreshResult(await refreshCache(client, cache, fileKey, force ?? false))),
  );

const registerListFrames = (server: McpServer, { cache }: Dependencies) =>
  server.tool(
    "figma_list_frames",
    "List cached top-level frames (screens) in a Figma file, with their node ids, page, and size. Start here before figma_get_screen.",
    { fileKey: fileKeyField },
    async ({ fileKey }) => textResult(formatFrameList(listFrames(await loadCachedDocument(cache, fileKey)))),
  );

const registerGetScreen = (server: McpServer, { cache }: Dependencies) =>
  server.tool(
    "figma_get_screen",
    "Get a frame's full semantic outline from the cache: layout, fills, corner radius, and text content per node. Not generated code — geometry and style facts only.",
    { fileKey: fileKeyField, nodeId: nodeIdField("Node id of a frame, e.g. '1:334'. Get one from figma_list_frames.") },
    async ({ fileKey, nodeId }) => textResult(formatScreen(await findCachedNode(cache, fileKey, nodeId))),
  );

const registerGetPalette = (server: McpServer, { cache }: Dependencies) =>
  server.tool(
    "figma_get_palette",
    "List distinct solid fill/stroke colors used in a file or one frame's subtree, most-used first.",
    {
      fileKey: fileKeyField,
      nodeId: nodeIdField("Limit to this node's subtree, e.g. '1:334'. Omit to scan the whole file.").optional(),
    },
    async ({ fileKey, nodeId }) => {
      const root = nodeId ? await findCachedNode(cache, fileKey, nodeId) : await loadCachedDocument(cache, fileKey);
      return textResult(formatPalette(collectPalette(root)));
    },
  );

const registerExportImage = (server: McpServer, { cache }: Dependencies) =>
  server.tool(
    "figma_export_image",
    "Get the local file path of a rendered PNG for a node. Served from the local cache only, which figma_refresh_cache populates for top-level frames; this tool never calls Figma.",
    { fileKey: fileKeyField, nodeId: nodeIdField("Node id to render, e.g. '1:334'.") },
    async ({ fileKey, nodeId }) => textResult(await cachedImagePath(cache, fileKey, nodeId)),
  );

const MAX_FIND_RESULTS = 50;

const registerFindNodes = (server: McpServer, { cache }: Dependencies) =>
  server.tool(
    "figma_find_nodes",
    "Search the cached tree for nodes by name substring, exact type, or text content — for locating a node id without inspecting the outline by hand (e.g. a photo/image-fill layer excluded from figma_get_screen's siblings). Requires at least one filter.",
    {
      fileKey: fileKeyField,
      name: z.string().optional().describe("Case-insensitive substring match on node name, e.g. 'Hero'."),
      type: z.string().optional().describe("Exact node type, e.g. 'TEXT', 'FRAME', 'VECTOR', 'RECTANGLE'."),
      textContains: z.string().optional().describe("Case-insensitive substring match on a TEXT node's characters."),
      limit: z.number().int().positive().max(200).optional().describe("Max results (default 50)."),
    },
    async ({ fileKey, name, type, textContains, limit }) => {
      if (!name && !type && !textContains) {
        throw new Error("Provide at least one of: name, type, textContains.");
      }
      const document = await loadCachedDocument(cache, fileKey);
      const matches = findNodes(document, { name, type, textContains }, limit ?? MAX_FIND_RESULTS);
      return textResult(formatNodeMatches(matches));
    },
  );

const JQ_SCHEMA_HINT = [
  "Input shape: { name, lastModified, document: FigmaNode }.",
  "FigmaNode fields worth querying: id, name, type, absoluteBoundingBox {x,y,width,height},",
  "fills[] {type, color:{r,g,b,a}, opacity}, strokes[], strokeWeight, cornerRadius,",
  "effects[] {type, radius, color}, layoutMode, itemSpacing, paddingTop/Right/Bottom/Left,",
  "characters, style {fontFamily, fontWeight, fontSize}, children[].",
  'Examples: \'.. | objects | select(.type=="TEXT") | .characters\' to list all text;',
  '\'[.. | objects | select(.name=="Chip")][0] | {cornerRadius, effects, strokeWeight}\'',
  "to inspect fields the other tools don't surface.",
].join(" ");

const registerQuery = (server: McpServer, { cache }: Dependencies) =>
  server.tool(
    "figma_query",
    `Run a jq filter against the file's cached raw JSON. Escape hatch for anything the other tools don't expose — raw paint objects, per-corner radii, arbitrary field combinations. ${JQ_SCHEMA_HINT}`,
    {
      fileKey: fileKeyField,
      filter: z.string().describe('A jq filter expression, e.g. \'.document.children[0].children[] | select(.name=="Hero") | .id\'.'),
    },
    async ({ fileKey, filter }) => {
      const file = await cache.readFile(fileKey);
      if (!file) {
        throw new Error(`No cache for file ${fileKey} yet. Run figma_refresh_cache first.`);
      }
      return textResult(formatQueryResult(await runJqFilter(file, filter)));
    },
  );

const findCachedNode = async (cache: FigmaCache, fileKey: string, nodeId: string): Promise<FigmaNode> => {
  const node = findNode(await loadCachedDocument(cache, fileKey), nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found in cached file ${fileKey}.`);
  }
  return node;
};

export const registerTools = (server: McpServer, deps: Dependencies): void => {
  registerRefreshCache(server, deps);
  registerListFrames(server, deps);
  registerGetScreen(server, deps);
  registerGetPalette(server, deps);
  registerExportImage(server, deps);
  registerFindNodes(server, deps);
  registerQuery(server, deps);
};
