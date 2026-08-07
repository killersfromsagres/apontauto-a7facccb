import type { Point } from "./api";

export interface ViewportState {
  zoom: number;
  offset: { x: number; y: number };
}

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Converts screen coordinates (relative to a container) to image-space coordinates.
 * @param screenX X coordinate on screen
 * @param screenY Y coordinate on screen
 * @param containerRect The bounding client rect of the viewport container
 * @param viewport Current zoom and pan state
 * @param imageSize The natural dimensions of the image
 */
export function screenToImageCoordinates(
  screenX: number,
  screenY: number,
  containerRect: DOMRect,
  viewport: ViewportState,
  imageSize: ImageSize
): Point {
  // 1. Get position relative to container
  const rx = screenX - containerRect.left;
  const ry = screenY - containerRect.top;

  // 2. We use SVG coordinates (0..imageWidth, 0..imageHeight)
  // The layer is translated by viewport.offset and scaled by viewport.zoom
  const ix = (rx - viewport.offset.x) / viewport.zoom;
  const iy = (ry - viewport.offset.y) / viewport.zoom;

  // 3. Ensure we stay within image bounds
  return { 
    x: Math.max(0, Math.min(imageSize.width, ix)), 
    y: Math.max(0, Math.min(imageSize.height, iy)) 
  };
}

/**
 * Converts image-space coordinates to screen coordinates.
 */
export function imageToScreenCoordinates(
  point: Point,
  containerRect: DOMRect,
  viewport: ViewportState,
  imageSize: ImageSize
): { x: number; y: number } {
  const rx = point.x * viewport.zoom + viewport.offset.x;
  const ry = point.y * viewport.zoom + viewport.offset.y;

  return {
    x: containerRect.left + rx,
    y: containerRect.top + ry,
  };
}

/**
 * Calculates how an image with 'object-fit: contain' is rendered in a container.
 */
export function getImageRenderBounds(container: { width: number; height: number }, image: ImageSize) {
  const containerRatio = container.width / container.height;
  const imageRatio = image.width / image.height;

  let renderedWidth, renderedHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (containerRatio > imageRatio) {
    // Container is wider than image
    renderedHeight = container.height;
    renderedWidth = container.height * imageRatio;
    offsetX = (container.width - renderedWidth) / 2;
  } else {
    // Container is taller than image
    renderedWidth = container.width;
    renderedHeight = container.width / imageRatio;
    offsetY = (container.height - renderedHeight) / 2;
  }

  return { renderedWidth, renderedHeight, offsetX, offsetY };
}
