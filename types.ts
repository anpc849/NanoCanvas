
export interface Point {
  x: number;
  y: number;
}

export interface BaseItem {
  id: string;
  x: number;
  y: number;
  rotation: number;
}

export interface ImageItem extends BaseItem {
  type: 'image';
  width: number;
  height: number;
  src: string; // base64 data URL or blob URL
  thumbnailSrc?: string; // smaller base64 data URL for localStorage
  mimeType: string;
  prompt: string; // The original prompt or filename
}

export interface VideoItem extends BaseItem {
    type: 'video';
    width: number;
    height: number;
    src: string; // blob URL
    mimeType: string;
    prompt: string;
}

export interface TextItem extends BaseItem {
  type: 'text';
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface DrawingItem {
    id: string;
    type: 'drawing';
    points: Point[];
    color: string;
    strokeWidth: number;
    opacity: number;
    rotation: number;
}

export type CanvasItem = ImageItem | TextItem | DrawingItem | VideoItem;

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// FIX: Add 'expanding' to InteractionMode to support image expansion interactions. This resolves type errors where 'expanding' was being compared to InteractionMode.
export type InteractionMode = 'none' | 'moving' | 'selecting' | 'drawing' | 'resizing' | 'rotating' | 'panning' | 'magicFill' | 'expanding';

export interface DrawingOptions {
  color: string;
  strokeWidth: number;
  opacity: number;
}

export interface TextOptions {
  color: string;
  fontSize: number;
}

export interface GridOptions {
  isVisible: boolean;
  spacing: number;
  color: string;
}

export interface GenerationTask {
  id: string;
  type: 'standard' | 'magic-fill' | 'video';
  status: 'interpreting' | 'generating' | 'completed' | 'error';
  log: { type: 'status' | 'prompt' | 'result'; message: string }[];
  selectionRect: SelectionRect;
  error?: string;
}

export interface ImagePreview {
    newImage: ImageItem;
    itemsToReplace: CanvasItem[];
}

export interface MagicFillState {
  isActive: boolean;
  targetItemId: string | null;
  sourceItemId: string | null;
  maskDrawing: DrawingItem | null;
}

export const AVAILABLE_MODELS = {
  textToImage: ['imagen-4.0-generate-001', 'gemini-2.5-flash-image-preview'],
  canvasToImage: ['gemini-2.5-flash-image-preview'],
  video: ['veo-2.0-generate-001'],
  interpretation: ['gemini-2.5-flash'],
};

export interface ModelSettings {
  textToImage: string;
  canvasToImage: string;
  video: string;
  interpretation: string;
}