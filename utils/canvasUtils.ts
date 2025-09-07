
import { DrawingItem, ImageItem, CanvasItem, SelectionRect } from '../types';
// FIX: Import `rotatePoint` for use in mask generation.
import { getBoundingBox, getCenter, isItemInSelection, rotatePoint } from './geometry';

export const convertDrawingToImageItem = (drawing: DrawingItem): Promise<ImageItem | null> => {
    return new Promise((resolve) => {
        const box = getBoundingBox(drawing);
        if (box.width <= 0 || box.height <= 0) {
            // A drawing that is just a dot or a straight line has no dimensions to render into an image.
            // We resolve with null to indicate it should be ignored, rather than crashing the generation process.
            return resolve(null);
        }

        const PADDING = drawing.strokeWidth * 2;
        const canvas = document.createElement('canvas');
        canvas.width = box.width + PADDING * 2;
        canvas.height = box.height + PADDING * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Failed to get canvas context for drawing conversion.');
            return resolve(null);
        }

        // Make background transparent
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = drawing.color;
        ctx.lineWidth = drawing.strokeWidth;
        ctx.globalAlpha = drawing.opacity;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        drawing.points.forEach((p, i) => {
            const x = p.x - box.x + PADDING;
            const y = p.y - box.y + PADDING;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        const dataUrl = canvas.toDataURL('image/png');
        
        resolve({
            id: `drawing_img_${drawing.id}`,
            type: 'image',
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            src: dataUrl,
            mimeType: 'image/png',
            prompt: 'a user-made drawing',
            rotation: 0, 
        });
    });
};

// FIX: Implement and export missing canvas utility functions to resolve compilation errors.

/**
 * Renders a snapshot of the specified canvas area and items to a data URL.
 */
export const createCanvasSnapshot = (items: CanvasItem[], selectionRect: SelectionRect): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = selectionRect.width;
        canvas.height = selectionRect.height;
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
            return reject(new Error("Could not get canvas context for snapshot."));
        }
        
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const itemsToRender = items.filter(item => isItemInSelection(item, selectionRect));
        
        const mediaElements = new Map<string, HTMLImageElement | HTMLVideoElement>();
        const mediaLoadPromises: Promise<void>[] = [];

        itemsToRender.forEach(item => {
            if ((item.type === 'image' || item.type === 'video') && item.src && !mediaElements.has(item.id)) {
                const promise = new Promise<void>((resolveLoad) => {
                    const el = item.type === 'image' ? new Image() : document.createElement('video');
                    el.crossOrigin = "anonymous";
                    const onLoaded = () => {
                        mediaElements.set(item.id, el);
                        resolveLoad();
                    };
                    const onError = () => {
                        console.warn(`Could not load media for snapshot: ${item.src}`);
                        resolveLoad(); 
                    };

                    if (el instanceof HTMLImageElement) {
                        el.onload = onLoaded;
                        el.onerror = onError;
                    } else if (el instanceof HTMLVideoElement) {
                        el.onloadeddata = onLoaded;
                        el.onerror = onError;
                    }
                    el.src = item.src;
                });
                mediaLoadPromises.push(promise);
            }
        });

        await Promise.all(mediaLoadPromises);
        ctx.translate(-selectionRect.x, -selectionRect.y);

        for (const item of itemsToRender) {
            ctx.save();
            const box = getBoundingBox(item);
            const center = getCenter(box);
            ctx.translate(center.x, center.y);
            ctx.rotate(item.rotation * Math.PI / 180);
            ctx.translate(-center.x, -center.y);
            
            switch (item.type) {
                case 'image':
                case 'video': {
                    const mediaEl = mediaElements.get(item.id);
                    if (mediaEl) {
                        ctx.drawImage(mediaEl, item.x, item.y, item.width, item.height);
                    }
                    break;
                }
                case 'text': {
                    ctx.font = `${item.fontSize}px sans-serif`;
                    ctx.fillStyle = item.color;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(item.text, item.x, item.y, item.width);
                    break;
                }
                case 'drawing': {
                    if (item.points.length < 2) continue;
                    ctx.strokeStyle = item.color;
                    ctx.lineWidth = item.strokeWidth;
                    ctx.globalAlpha = item.opacity;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    item.points.forEach((p, i) => {
                        if (i === 0) ctx.moveTo(p.x, p.y);
                        else ctx.lineTo(p.x, p.y);
                    });
                    ctx.stroke();
                    break;
                }
            }
            ctx.restore();
        }
        resolve(canvas.toDataURL('image/png'));
    });
};

/**
 * Creates a black and white mask image from a drawing relative to a target image.
 */
export const createMaskImageFromDrawing = (drawing: DrawingItem, targetItem: ImageItem): Promise<string> => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = targetItem.width;
        canvas.height = targetItem.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            return reject(new Error("Could not get canvas context for mask generation."));
        }

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = drawing.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const center = {
            x: targetItem.x + targetItem.width / 2,
            y: targetItem.y + targetItem.height / 2,
        };
        
        if (drawing.points.length > 1) {
            ctx.beginPath();
            drawing.points.forEach((p, i) => {
                const unrotatedP = rotatePoint(p, center, -targetItem.rotation);
                const localX = unrotatedP.x - targetItem.x;
                const localY = unrotatedP.y - targetItem.y;
                if (i === 0) {
                    ctx.moveTo(localX, localY);
                } else {
                    ctx.lineTo(localX, localY);
                }
            });
            ctx.stroke();
        }
        
        resolve(canvas.toDataURL('image/png'));
    });
};

/**
 * Creates an enlarged canvas with the target image placed inside for outpainting.
 */
export const createImageForOutpainting = (
    targetItem: ImageItem,
    combinedRect: SelectionRect
): Promise<{ enlargedImageBase64: string, placement: SelectionRect }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = combinedRect.width;
            canvas.height = combinedRect.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Could not create canvas context for outpainting."));

            const placement = {
                x: targetItem.x - combinedRect.x,
                y: targetItem.y - combinedRect.y,
                width: targetItem.width,
                height: targetItem.height,
            };

            ctx.drawImage(img, placement.x, placement.y, placement.width, placement.height);
            
            resolve({
                enlargedImageBase64: canvas.toDataURL('image/png'),
                placement,
            });
        };
        img.onerror = (err) => reject(new Error('Failed to load image for outpainting: ' + err));
        img.src = targetItem.src;
    });
};

/**
 * Creates a mask for outpainting, with a black area for the existing image and white for the new area.
 */
export const createOutpaintingMask = (
    width: number,
    height: number,
    placement: SelectionRect
): string => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get canvas context for outpainting mask.");

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = 'black';
    ctx.fillRect(placement.x, placement.y, placement.width, placement.height);
    
    return canvas.toDataURL('image/png');
};
