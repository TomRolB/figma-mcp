import type { FigmaNode } from "./figmaTypes.js";
import type { FrameSummary, NodeMatch, PaletteEntry } from "./nodeTree.js";
import { summarizePaints } from "./nodeTree.js";
import type { RefreshResult } from "./refresh.js";

const MAX_OUTLINE_DEPTH = 8;
const MAX_OUTLINE_LINES = 300;

export const formatFrameList = (frames: FrameSummary[]): string =>
  frames.length === 0
    ? "No frames cached. Run figma_refresh_cache first."
    : frames.map((frame) => `${frame.id} — ${frame.name} (${frame.pageName}) ${frame.width}x${frame.height}`).join("\n");

export const formatPalette = (entries: PaletteEntry[]): string =>
  entries.length === 0 ? "No solid colors found." : entries.map((entry) => `${entry.hex} (${entry.count} uses)`).join("\n");

export const formatNodeMatches = (matches: NodeMatch[]): string =>
  matches.length === 0
    ? "No matching nodes."
    : matches.map((match) => `${match.id} — ${match.name} (${match.type})${match.path ? ` [${match.path}]` : ""}`).join("\n");

const MAX_QUERY_RESULT_CHARS = 4000;

export const formatQueryResult = (result: unknown): string => {
  const json = JSON.stringify(result, null, 2) ?? "null";
  return json.length > MAX_QUERY_RESULT_CHARS
    ? `${json.slice(0, MAX_QUERY_RESULT_CHARS)}\n… truncated (${json.length - MAX_QUERY_RESULT_CHARS} more chars). Narrow the filter.`
    : json;
};

export const formatRefreshResult = (result: RefreshResult): string =>
  result.refreshed
    ? `Refreshed from Figma (last modified ${result.lastModified}). Cached ${result.frameCount} frame(s), downloaded ${result.imagesDownloaded} image(s).`
    : `Cache is up to date (last modified ${result.lastModified}). ${result.frameCount} frame(s) cached.`;

export const formatScreen = (node: FigmaNode): string => {
  const lines: string[] = [];
  appendNodeLines(node, 0, lines);
  return lines.length > MAX_OUTLINE_LINES
    ? [...lines.slice(0, MAX_OUTLINE_LINES), `… truncated (${lines.length - MAX_OUTLINE_LINES} more lines)`].join("\n")
    : lines.join("\n");
};

const appendNodeLines = (node: FigmaNode, depth: number, lines: string[]): void => {
  if (depth > MAX_OUTLINE_DEPTH || lines.length > MAX_OUTLINE_LINES) {
    return;
  }
  const indent = "  ".repeat(depth);
  lines.push(`${indent}${nodeHeaderLine(node)}`);
  nodeDetailLines(node).forEach((detail) => lines.push(`${indent}  ${detail}`));
  (node.children ?? []).forEach((child) => appendNodeLines(child, depth + 1, lines));
};

const nodeHeaderLine = (node: FigmaNode): string => `${node.type} "${node.name}" (${node.id})${dimensionsSuffix(node)}`;

const dimensionsSuffix = (node: FigmaNode): string => {
  const box = node.absoluteBoundingBox;
  return box ? ` ${Math.round(box.width)}x${Math.round(box.height)}` : "";
};

const nodeDetailLines = (node: FigmaNode): string[] =>
  [layoutDetail(node), fillsDetail(node), strokeDetail(node), effectsDetail(node), textDetail(node), cornerDetail(node)].filter(
    (line): line is string => line !== null,
  );

const layoutDetail = (node: FigmaNode): string | null => {
  if (!node.layoutMode || node.layoutMode === "NONE") {
    return null;
  }
  const padding = `${node.paddingTop ?? 0}/${node.paddingRight ?? 0}/${node.paddingBottom ?? 0}/${node.paddingLeft ?? 0}`;
  return `layout: ${node.layoutMode}, gap ${node.itemSpacing ?? 0}, padding ${padding}`;
};

const fillsDetail = (node: FigmaNode): string | null => {
  const paints = summarizePaints(node.fills);
  return paints.length === 0 ? null : `fills: ${paints.join(", ")}`;
};

const strokeDetail = (node: FigmaNode): string | null => {
  const paints = summarizePaints(node.strokes);
  if (paints.length === 0) {
    return null;
  }
  const weight = node.strokeWeight !== undefined ? ` width ${node.strokeWeight}` : "";
  return `stroke: ${paints.join(", ")}${weight}`;
};

const effectsDetail = (node: FigmaNode): string | null => {
  const visible = (node.effects ?? []).filter((effect) => effect.visible !== false);
  if (visible.length === 0) {
    return null;
  }
  return `effects: ${visible.map(describeEffect).join(", ")}`;
};

const describeEffect = (effect: NonNullable<FigmaNode["effects"]>[number]): string =>
  effect.radius !== undefined ? `${effect.type}(${effect.radius})` : effect.type;

const textDetail = (node: FigmaNode): string | null => {
  if (node.type !== "TEXT" || !node.characters) {
    return null;
  }
  const font = `${node.style?.fontFamily ?? "?"} ${node.style?.fontSize ?? "?"}/${node.style?.fontWeight ?? "?"}`;
  return `text: "${node.characters}" (${font})`;
};

const cornerDetail = (node: FigmaNode): string | null =>
  node.cornerRadius ? `corner radius: ${node.cornerRadius}` : null;
