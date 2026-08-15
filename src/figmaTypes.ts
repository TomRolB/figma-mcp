// Minimal subset of the Figma REST API's node shape — only the fields the
// formatters in nodeTree.ts actually read. See developers.figma.com/docs/rest-api.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Paint {
  type: string;
  visible?: boolean;
  color?: Color;
  opacity?: number;
}

export interface Effect {
  type: string;
  visible?: boolean;
  radius?: number;
  color?: Color;
}

export interface TypeStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: Rect;
  fills?: Paint[];
  strokes?: Paint[];
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: Effect[];
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  characters?: string;
  style?: TypeStyle;
  children?: FigmaNode[];
}

export interface GetFileResponse {
  name: string;
  lastModified: string;
  document: FigmaNode;
}

export interface GetFileMetaResponse {
  name: string;
  last_touched_at: string;
}

export interface GetImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}
