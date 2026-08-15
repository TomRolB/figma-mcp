import type { FigmaCache } from "./cache.js";
import type { FigmaClient } from "./figmaClient.js";
import { listFrames, type FrameSummary } from "./nodeTree.js";

export interface RefreshResult {
  refreshed: boolean;
  frameCount: number;
  imagesDownloaded: number;
  lastModified: string;
}

// Orchestrates the "prefetch once, refresh on demand" strategy: a cheap /meta
// call decides whether the expensive full-file + bulk-image pull is needed at all.
export const refreshCache = async (
  client: FigmaClient,
  cache: FigmaCache,
  fileKey: string,
  force: boolean,
): Promise<RefreshResult> => {
  const remoteMeta = await client.getFileMeta(fileKey);
  const cachedMeta = await cache.readMeta(fileKey);
  const isStale = force || !cachedMeta || cachedMeta.lastModified !== remoteMeta.last_touched_at;

  if (!isStale) {
    return skipRefresh(cache, fileKey, cachedMeta.lastModified);
  }
  return performRefresh(client, cache, fileKey);
};

const skipRefresh = async (cache: FigmaCache, fileKey: string, lastModified: string): Promise<RefreshResult> => {
  const file = await cache.readFile(fileKey);
  const frameCount = file ? listFrames(file.document).length : 0;
  return { refreshed: false, frameCount, imagesDownloaded: 0, lastModified };
};

const performRefresh = async (client: FigmaClient, cache: FigmaCache, fileKey: string): Promise<RefreshResult> => {
  const file = await client.getFile(fileKey);
  await cache.writeFile(fileKey, file);
  await cache.writeMeta(fileKey, { lastModified: file.lastModified, cachedAt: new Date().toISOString() });

  const frames = listFrames(file.document);
  const imagesDownloaded = await downloadFrameImages(client, cache, fileKey, frames);
  return { refreshed: true, frameCount: frames.length, imagesDownloaded, lastModified: file.lastModified };
};

const downloadFrameImages = async (
  client: FigmaClient,
  cache: FigmaCache,
  fileKey: string,
  frames: FrameSummary[],
): Promise<number> => {
  if (frames.length === 0) {
    return 0;
  }
  const { images } = await client.getImages(fileKey, frames.map((frame) => frame.id));
  const downloads = Object.entries(images).map(([nodeId, url]) => saveImageIfPresent(client, cache, fileKey, nodeId, url));
  return (await Promise.all(downloads)).filter(Boolean).length;
};

const saveImageIfPresent = async (
  client: FigmaClient,
  cache: FigmaCache,
  fileKey: string,
  nodeId: string,
  url: string | null,
): Promise<boolean> => {
  if (!url) {
    return false;
  }
  await cache.writeImage(fileKey, nodeId, await client.downloadImage(url));
  return true;
};

// Fallback for exporting a node that wasn't part of the bulk frame-level export
// (e.g. a nested node the agent wants a picture of specifically).
export const ensureImage = async (
  client: FigmaClient,
  cache: FigmaCache,
  fileKey: string,
  nodeId: string,
): Promise<string> => {
  if (await cache.hasImage(fileKey, nodeId)) {
    return cache.imagePath(fileKey, nodeId);
  }
  const { images } = await client.getImages(fileKey, [nodeId]);
  const url = images[nodeId];
  if (!url) {
    throw new Error(`Figma did not return an image for node ${nodeId}`);
  }
  return cache.writeImage(fileKey, nodeId, await client.downloadImage(url));
};
