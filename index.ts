#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FigmaCache } from "./src/cache.js";
import { loadConfig } from "./src/config.js";
import { FigmaClient } from "./src/figmaClient.js";
import { registerTools } from "./src/tools.js";

const start = async () => {
  const config = loadConfig();
  const server = new McpServer({ name: "figma", version: "0.1.0" });
  registerTools(server, {
    client: new FigmaClient({ apiToken: config.apiToken }),
    cache: new FigmaCache(config.cacheDir),
  });
  await server.connect(new StdioServerTransport());
};

start().catch((error) => {
  console.error(`figma-mcp failed to start: ${error.message}`);
  process.exit(1);
});
