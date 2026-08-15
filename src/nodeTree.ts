import type { Color, FigmaNode } from "./figmaTypes.js";

export interface FrameSummary {
  id: string;
  name: string;
  pageName: string;
  width: number;
  height: number;
}

export interface PaletteEntry {
  hex: string;
  count: number;
}

export interface NodeMatch {
  id: string;
  name: string;
  type: string;
  path: string;
}

export interface NodeQuery {
  name?: string;
  type?: string;
  textContains?: string;
}

// Pure tree queries — no formatting, no I/O. responses.ts turns these into text.

export const findNode = (node: FigmaNode, nodeId: string): FigmaNode | null => {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
};

// Search by name substring / exact type / text content — the escape hatch for
// "where is the node that..." without the caller ever seeing raw node ids.
export const findNodes = (root: FigmaNode, query: NodeQuery, limit: number): NodeMatch[] => {
  const matches: NodeMatch[] = [];
  collectMatches(root, [], query, limit, matches);
  return matches;
};

const collectMatches = (
  node: FigmaNode,
  ancestorNames: string[],
  query: NodeQuery,
  limit: number,
  matches: NodeMatch[],
): void => {
  if (matches.length >= limit) {
    return;
  }
  if (matchesQuery(node, query)) {
    matches.push({ id: node.id, name: node.name, type: node.type, path: ancestorNames.join(" > ") });
  }
  const nextAncestors = [...ancestorNames, node.name];
  for (const child of node.children ?? []) {
    collectMatches(child, nextAncestors, query, limit, matches);
  }
};

const matchesQuery = (node: FigmaNode, query: NodeQuery): boolean => {
  if (query.type && node.type !== query.type) {
    return false;
  }
  if (query.name && !node.name.toLowerCase().includes(query.name.toLowerCase())) {
    return false;
  }
  if (query.textContains && !(node.characters ?? "").toLowerCase().includes(query.textContains.toLowerCase())) {
    return false;
  }
  return true;
};

// A "frame" is a top-level FRAME node directly under a page (CANVAS) node —
// what an agent means by "screen" in a Figma design file.
export const listFrames = (document: FigmaNode): FrameSummary[] =>
  (document.children ?? []).flatMap((page) =>
    (page.children ?? []).filter((node) => node.type === "FRAME").map((frame) => toFrameSummary(frame, page.name)),
  );

const toFrameSummary = (frame: FigmaNode, pageName: string): FrameSummary => ({
  id: frame.id,
  name: frame.name,
  pageName,
  width: Math.round(frame.absoluteBoundingBox?.width ?? 0),
  height: Math.round(frame.absoluteBoundingBox?.height ?? 0),
});

export const collectPalette = (node: FigmaNode): PaletteEntry[] => {
  const counts = new Map<string, number>();
  accumulatePaletteCounts(node, counts);
  return [...counts.entries()].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count);
};

const accumulatePaletteCounts = (node: FigmaNode, counts: Map<string, number>): void => {
  for (const hex of solidPaintHexes(node.fills)) {
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  for (const child of node.children ?? []) {
    accumulatePaletteCounts(child, counts);
  }
};

export const solidPaintHexes = (paints: FigmaNode["fills"]): string[] =>
  (paints ?? [])
    .filter((paint) => paint.type === "SOLID" && paint.visible !== false && paint.color)
    .map((paint) => colorToHex(paint.color as Color));

// Unlike solidPaintHexes, this never silently drops a paint — a non-solid paint
// (IMAGE, GRADIENT_LINEAR, ...) still shows up, just labeled by type instead of hex,
// so the outline never looks "colorless" when a node actually has a photo fill.
export const summarizePaints = (paints: FigmaNode["fills"]): string[] =>
  (paints ?? [])
    .filter((paint) => paint.visible !== false)
    .map((paint) => summarizePaint(paint));

const summarizePaint = (paint: NonNullable<FigmaNode["fills"]>[number]): string => {
  const base = paint.type === "SOLID" && paint.color ? colorToHex(paint.color) : paint.type;
  const opacitySuffix = paint.opacity !== undefined && paint.opacity < 1 ? ` ${Math.round(paint.opacity * 100)}%` : "";
  return `${base}${opacitySuffix}`;
};

export const colorToHex = (color: Color): string =>
  `#${toByteHex(color.r)}${toByteHex(color.g)}${toByteHex(color.b)}`.toUpperCase();

const toByteHex = (channel: number): string => Math.round(channel * 255).toString(16).padStart(2, "0");
