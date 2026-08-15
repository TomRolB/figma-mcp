import path from "node:path";

export interface Config {
  apiToken: string;
  cacheDir: string;
}

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

// Cache defaults to a folder under the current working directory, so each project
// that registers this server gets its own cache alongside its own files.
export const loadConfig = (): Config => ({
  apiToken: requiredEnv("FIGMA_API_TOKEN"),
  cacheDir: process.env.FIGMA_CACHE_DIR
    ? path.resolve(process.env.FIGMA_CACHE_DIR)
    : path.join(process.cwd(), ".figma-cache"),
});
