import { Point, DrawingItem, CanvasItem, ImageItem, TextItem, SelectionRect } from '../types';

export const rotatePoint = (point: Point, center: Point, angleDegrees: number): Point => {
    const angleRadians = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const newX = dx * cos - dy * sin + center.x;
    const newY = dx * sin + dy * cos + center.y;
    return { x: newX, y: newY };
};

export const getBoundingBox = (item: CanvasItem): { x: number, y: number, width: number, height: number } => {
    if (item.type === 'drawing') {
        if (item.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
        const xs = item.points.map(p => p.x);
        const ys = item.points.map(p => p.y);
        // Pad the box by half the stroke width to ensure strokes aren't clipped.
        const padding = item.strokeWidth / 2;
        const minX = Math.min(...xs) - padding;
        const minY = Math.min(...ys) - padding;
        const maxX = Math.max(...xs) + padding;
        const maxY = Math.max(...ys) + padding;
        
        // Ensure the box has at least a minimal dimension to be visible.
        const width = Math.max(item.strokeWidth, maxX - minX);
        const height = Math.max(item.strokeWidth, maxY - minY);

        return { x: minX, y: minY, width, height };
    }
    // Handles 'image', 'video', and 'text' items
    return { x: item.x, y: item.y, width: item.width, height: item.height };
};

export const getRotatedBoundingBox = (item: CanvasItem): { x: number, y: number, width: number, height: number } => {
    const box = getBoundingBox(item);
    const center = getCenter(box);

    const corners = [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x, y: box.y + box.height },
        { x: box.x + box.width, y: box.y + box.height },
    ];

    const rotatedCorners = corners.map(corner => rotatePoint(corner, center, item.rotation));

    const xs = rotatedCorners.map(p => p.x);
    const ys = rotatedCorners.map(p => p.y);

    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const isPointInBox = (point: Point, box: { x: number, y: number, width: number, height: number }): boolean => {
    return (
        point.x >= box.x &&
        point.x <= box.x + box.width &&
        point.y >= box.y &&
        point.y <= box.y + box.height
    );
};


export const getCenter = (box: { x: number, y: number, width: number, height: number }): Point => {
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};


export function isItemInSelection(item: CanvasItem, rect: SelectionRect): boolean {
    const itemBox = getRotatedBoundingBox(item);
     return (
        itemBox.x < rect.x + rect.width &&
        itemBox.x + itemBox.width > rect.x &&
        itemBox.y < rect.y + rect.height &&
        itemBox.y + itemBox.height > rect.y
    );
}

export function getCenterOfSelection(rect: SelectionRect): Point {
    return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
    };
}