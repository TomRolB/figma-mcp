import fs from "node:fs/promises";
import path from "node:path";
import type { GetFileResponse } from "./figmaTypes.js";

export interface CacheMeta {
  lastModified: string;
  cachedAt: string;
}

// All I/O for the on-disk cache lives here — nothing else touches the filesystem.
export class FigmaCache {
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  async readFile(fileKey: string): Promise<GetFileResponse | null> {
    return this.#readJson<GetFileResponse>(this.#filePath(fileKey));
  }

  async writeFile(fileKey: string, data: GetFileResponse): Promise<void> {
    await this.#writeJson(this.#filePath(fileKey), data);
  }

  async readMeta(fileKey: string): Promise<CacheMeta | null> {
    return this.#readJson<CacheMeta>(this.#metaPath(fileKey));
  }

  async writeMeta(fileKey: string, meta: CacheMeta): Promise<void> {
    await this.#writeJson(this.#metaPath(fileKey), meta);
  }

  async writeImage(fileKey: string, nodeId: string, bytes: Buffer): Promise<string> {
    const imagePath = this.imagePath(fileKey, nodeId);
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.writeFile(imagePath, bytes);
    return imagePath;
  }

  async hasImage(fileKey: string, nodeId: string): Promise<boolean> {
    return this.#exists(this.imagePath(fileKey, nodeId));
  }

  imagePath(fileKey: string, nodeId: string): string {
    return path.join(this.#fileDir(fileKey), "images", `${this.#sanitize(nodeId)}.png`);
  }

  #fileDir(fileKey: string): string {
    return path.join(this.cacheDir, fileKey);
  }

  #filePath(fileKey: string): string {
    return path.join(this.#fileDir(fileKey), "file.json");
  }

  #metaPath(fileKey: string): string {
    return path.join(this.#fileDir(fileKey), "meta.json");
  }

  #sanitize(nodeId: string): string {
    return nodeId.replace(/[:/\\]/g, "-");
  }

  async #readJson<T>(filePath: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async #writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async #exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
