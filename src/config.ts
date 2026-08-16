import path from "node:path";

export interface Config {
  apiToken: () => string;
  cacheDir: string;
}

const DEFAULT_ENV_FILE_NAME = ".env";
const DEFAULT_CACHE_DIR_NAME = ".figma-cache";

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const pathFromEnvOr = (overrideVariable: string, fallback: string): string => {
  const override = process.env[overrideVariable];
  return override ? path.resolve(override) : fallback;
};

const isMissingFile = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException)?.code === "ENOENT";

// A real environment variable stays authoritative over the file, so a shell export or a
// CI secret can override a checked-out .env. Node's loadEnvFile makes no such promise,
// hence the snapshot and reinstatement rather than relying on its precedence.
const loadEnvFileWithoutOverriding = (envFilePath: string): void => {
  const realEnvironment = { ...process.env };
  try {
    process.loadEnvFile(envFilePath);
  } catch (error) {
    if (isMissingFile(error)) {
      return;
    }
    throw error;
  }
  Object.assign(process.env, realEnvironment);
};

// Both the .env file and the cache default to the current working directory, so each
// project that registers this server gets its own credentials and its own cache. The token
// is resolved lazily so a cache-only install starts, and only fails if it reaches Figma.
export const loadConfig = (): Config => {
  const projectRoot = process.cwd();
  loadEnvFileWithoutOverriding(
    pathFromEnvOr("FIGMA_ENV_FILE", path.join(projectRoot, DEFAULT_ENV_FILE_NAME)),
  );
  return {
    apiToken: () => requiredEnv("FIGMA_API_TOKEN"),
    cacheDir: pathFromEnvOr("FIGMA_CACHE_DIR", path.join(projectRoot, DEFAULT_CACHE_DIR_NAME)),
  };
};
