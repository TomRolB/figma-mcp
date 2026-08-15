import type { GetFileMetaResponse, GetFileResponse, GetImagesResponse } from "./figmaTypes.js";

const API_BASE = "https://api.figma.com/v1";
const TOO_MANY_REQUESTS = 429;
const MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

export type FetchImpl = typeof fetch;

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const retryDelayMs = (response: Response): number => {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_DELAY_MS;
};

const ensureOk = (response: Response, description: string): Response => {
  if (!response.ok) {
    throw new Error(`Figma request failed (${response.status}) for ${description}`);
  }
  return response;
};

// fetchImpl is injected so the client is testable with a stub instead of a mock.
export class FigmaClient {
  private readonly apiToken: string;
  private readonly fetchImpl: FetchImpl;

  constructor({ apiToken, fetchImpl = fetch }: { apiToken: string; fetchImpl?: FetchImpl }) {
    this.apiToken = apiToken;
    this.fetchImpl = fetchImpl;
  }

  async getFile(fileKey: string): Promise<GetFileResponse> {
    const response = await this.#get(`${API_BASE}/files/${fileKey}`, `file ${fileKey}`);
    return response.json() as Promise<GetFileResponse>;
  }

  async getFileMeta(fileKey: string): Promise<GetFileMetaResponse> {
    const response = await this.#get(`${API_BASE}/files/${fileKey}/meta`, `file meta ${fileKey}`);
    return response.json() as Promise<GetFileMetaResponse>;
  }

  async getImages(
    fileKey: string,
    nodeIds: string[],
    { format = "png", scale = 2 }: { format?: "png" | "jpg" | "svg" | "pdf"; scale?: number } = {},
  ): Promise<GetImagesResponse> {
    const url = new URL(`${API_BASE}/images/${fileKey}`);
    url.searchParams.set("ids", nodeIds.join(","));
    url.searchParams.set("format", format);
    url.searchParams.set("scale", String(scale));
    const response = await this.#get(url.toString(), `images ${fileKey}`);
    return response.json() as Promise<GetImagesResponse>;
  }

  // Image render URLs are unauthenticated Figma-CDN links, not API calls — no token needed.
  async downloadImage(url: string): Promise<Buffer> {
    const response = ensureOk(await this.fetchImpl(url), `image download ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async #get(url: string, description: string): Promise<Response> {
    const options = { headers: { "X-Figma-Token": this.apiToken } };
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await this.fetchImpl(url, options);
      if (response.status !== TOO_MANY_REQUESTS || attempt === MAX_RETRIES) {
        return ensureOk(response, description);
      }
      await delay(retryDelayMs(response));
    }
    throw new Error(`Unreachable: retry loop exited without returning for ${description}`);
  }
}
