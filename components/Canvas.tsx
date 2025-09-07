import React, { useState, useRef, useEffect } from 'react';
import { CanvasItem, Point, SelectionRect, InteractionMode, DrawingItem, TextItem, DrawingOptions, TextOptions, ImageItem, MagicFillState, VideoItem, GridOptions } from '../types';
import { isItemInSelection, getBoundingBox, getCenter, rotatePoint, getRotatedBoundingBox, isPointInBox } from '../utils/geometry';

export type Handle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'rotate';

interface CanvasProps {
  items: CanvasItem[];
  setItems: (updater: (prev: CanvasItem[]) => CanvasItem[], options?: { commit?: boolean }) => void;
  isDrawingMode: boolean;
  isTextMode: boolean;
  drawingOptions: DrawingOptions;
  textOptions: TextOptions;
  selectionRect: SelectionRect | null;
  onSelectionChange: (rect: SelectionRect | null, items: CanvasItem[]) => void;
  onModeChange: () => void;
  zoom: number;
  pan: Point;
  setPan: React.Dispatch<React.SetStateAction<Point>>;
  onShowContextMenu: (data: {x: number; y: number; canvasPoint: Point; item?: CanvasItem}) => void;
  previewItem?: CanvasItem;
  ghostedItemIds?: string[];
  magicFillState: MagicFillState;
  onMaskUpdate: (drawing: DrawingItem | null) => void;
  expansionState: { isActive: boolean; targetItem: ImageItem | null; };
  onExpansionAreaDefined: (rect: SelectionRect, handle: Handle) => void;
  gridOptions: GridOptions;
  onInteractionEnd: () => void;
}

const ControlBox: React.FC<{
    box: SelectionRect;
    rotation?: number;
    onHandleMouseDown: (e: React.MouseEvent, handle: Handle, box: SelectionRect) => void;
    isExpansion?: boolean;
}> = ({ box, rotation = 0, onHandleMouseDown, isExpansion = false }) => {
    if (box.width === 0 || box.height === 0) return null;

    const styles: React.CSSProperties = {
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        pointerEvents: 'none',
    };

    const handleBaseStyle: React.CSSProperties = {
        position: 'absolute',
        border: `1px solid ${isExpansion ? '#22c55e' : '#a855f7'}`,
        backgroundColor: 'white',
        pointerEvents: 'all',
    };
    
    const handleSize = 8;
    const handles: { type: Handle, style: React.CSSProperties }[] = [
        // Corners
        { type: 'nw', style: { top: -handleSize / 2, left: -handleSize / 2, cursor: 'nwse-resize', width: handleSize, height: handleSize, borderRadius: '50%' } },
        { type: 'ne', style: { top: -handleSize / 2, right: -handleSize / 2, cursor: 'nesw-resize', width: handleSize, height: handleSize, borderRadius: '50%' } },
        { type: 'sw', style: { bottom: -handleSize / 2, left: -handleSize / 2, cursor: 'nesw-resize', width: handleSize, height: handleSize, borderRadius: '50%' } },
        { type: 'se', style: { bottom: -handleSize / 2, right: -handleSize / 2, cursor: 'nwse-resize', width: handleSize, height: handleSize, borderRadius: '50%' } },
        // Edges
        { type: 'n', style: { top: -handleSize / 2, left: `calc(50% - ${handleSize/2}px)`, cursor: 'ns-resize', width: handleSize, height: handleSize } },
        { type: 's', style: { bottom: -handleSize / 2, left: `calc(50% - ${handleSize/2}px)`, cursor: 'ns-resize', width: handleSize, height: handleSize } },
        { type: 'w', style: { top: `calc(50% - ${handleSize/2}px)`, left: -handleSize / 2, cursor: 'ew-resize', width: handleSize, height: handleSize } },
        { type: 'e', style: { top: `calc(50% - ${handleSize/2}px)`, right: -handleSize / 2, cursor: 'ew-resize', width: handleSize, height: handleSize } },
    ];
    
    if (!isExpansion) {
        handles.push({ type: 'rotate', style: { top: -handleSize * 3, left: `calc(50% - ${handleSize/2}px)`, cursor: 'grab', width: handleSize, height: handleSize, borderRadius: '50%' } });
    }

    return (
        <div style={styles}>
            <div className={`absolute inset-0 border border-dashed ${isExpansion ? 'border-green-500' : 'border-purple-500'}`} />
            {handles.map(({ type, style }) => (
                <div key={type} style={{ ...handleBaseStyle, ...style }} onMouseDown={(e) => onHandleMouseDown(e, type, box)} />
            ))}
        </div>
    );
};


const Canvas: React.FC<CanvasProps> = ({ 
    items, setItems, isDrawingMode, isTextMode, drawingOptions, textOptions, selectionRect, onSelectionChange, onModeChange, zoom, pan, setPan, onShowContextMenu, previewItem, ghostedItemIds = [], magicFillState, onMaskUpdate, expansionState, onExpansionAreaDefined, gridOptions, onInteractionEnd
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentItem, setCurrentItem] = useState<CanvasItem | null>(null);
  const [currentDrawing, setCurrentDrawing] = useState<DrawingItem | null>(null);
  const [transientSelectionRect, setTransientSelectionRect] = useState<SelectionRect | null>(null);
  const [editingTextItem, setEditingTextItem] = useState<TextItem | null>(null);
  const [singlySelectedItemId, setSinglySelectedItemId] = useState<string | null>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  
  const [activeHandle, setActiveHandle] = useState<Handle | null>(null);
  const [originalItemState, setOriginalItemState] = useState<any>(null);
  const [expansionGhostRect, setExpansionGhostRect] = useState<SelectionRect | null>(null);
  const gestureDidCommit = useRef(false);

  const getCanvasPoint = (e: React.MouseEvent | MouseEvent): Point => {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return { x: 0, y: 0 };
    const screenX = e.clientX - canvasRect.left;
    const screenY = e.clientY - canvasRect.top;
    return {
        x: (screenX - pan.x) / zoom,
        y: (screenY - pan.y) / zoom,
    };
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, item: TextItem) => {
    const commit = !gestureDidCommit.current;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, text: e.target.value } : i), { commit });
    if (commit) gestureDidCommit.current = true;
  };
  
  const handleTextBlur = () => {
    setEditingTextItem(null);
  };
  
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDrawingMode || isTextMode || editingTextItem) return;
    const clickedItem = findItemAtPoint(getCanvasPoint(e));

    if (clickedItem && clickedItem.type === 'text') {
        gestureDidCommit.current = false;
        setEditingTextItem(clickedItem);
        setSinglySelectedItemId(clickedItem.id);
        onSelectionChange(null, [clickedItem]);
        setInteractionMode('none');
        setCurrentItem(null);
    }
  };
  
  const findItemAtPoint = (point: Point): CanvasItem | null => {
    // Check items in reverse order to find the top-most one
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (ghostedItemIds.includes(item.id)) continue;
        const box = getBoundingBox(item);
        const center = getCenter(box);
        const rotatedPoint = rotatePoint(point, center, -item.rotation);

        if (rotatedPoint.x >= box.x && rotatedPoint.x <= box.x + box.width &&
            rotatedPoint.y >= box.y && rotatedPoint.y <= box.y + box.height) {
            return item;
        }
    }
    return null;
  };


  const handleInteractionStart = (e: React.MouseEvent, handle: Handle, itemOrBox: CanvasItem | SelectionRect) => {
      e.stopPropagation();
      gestureDidCommit.current = false;
      setStartPoint({ x: e.clientX, y: e.clientY });
      setActiveHandle(handle);

      const isItem = 'id' in itemOrBox;
      const item = isItem ? itemOrBox as CanvasItem : null;
      
      if (expansionState.isActive) {
          // FIX: The type assertion is no longer needed because 'expanding' has been added to the InteractionMode type in types.ts.
          setInteractionMode('expanding');
          const box = getRotatedBoundingBox(expansionState.targetItem!);
          setOriginalItemState({ box });
          setExpansionGhostRect(box);
          return;
      }
      
      if (!item) return;
      setCurrentItem(item);

      if (handle === 'rotate') {
          setInteractionMode('rotating');
          const box = getBoundingBox(item);
          const center = getCenter(box);
          setOriginalItemState({ center: { x: (center.x * zoom) + pan.x, y: (center.y * zoom) + pan.y }, initialRotation: item.rotation });
      } else {
          setInteractionMode('resizing');
          const box = getBoundingBox(item);
          const center = getCenter(box);
          // Store all corners in world coordinates
          setOriginalItemState({
              item,
              box,
              center,
              oppositeCorner: rotatePoint({
                  x: box.x + (handle.includes('e') ? 0 : box.width),
                  y: box.y + (handle.includes('s') ? 0 : box.height),
              }, center, item.rotation),
          });
      }
  };


  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    if (editingTextItem) setEditingTextItem(null);
    
    gestureDidCommit.current = false;
    
    if (expansionState.isActive) return;
    
    // Middle mouse button or spacebar panning
    if (e.button === 1 || (e.button === 0 && isSpacePanning)) {
        e.preventDefault();
        setInteractionMode('panning');
        setStartPoint({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        return;
    }

    // Only proceed with left clicks
    if (e.button !== 0) return;

    const point = getCanvasPoint(e);
    
    if (magicFillState.isActive) {
        const targetItem = items.find(i => i.id === magicFillState.targetItemId);
        if (targetItem && isPointInBox(point, getRotatedBoundingBox(targetItem))) {
            setInteractionMode('magicFill');
            const newMask: DrawingItem = { id: `mask_${Date.now()}`, type: 'drawing', points: [point], color: 'rgba(255,0,0,0.5)', strokeWidth: 30, opacity: 0.5, rotation: 0 };
            onMaskUpdate(newMask);
            return;
        }
    }

    if (isDrawingMode) {
      setInteractionMode('drawing');
      const newDrawing: DrawingItem = { id: `draw_${Date.now()}`, type: 'drawing', points: [point], rotation: 0, ...drawingOptions };
      setCurrentDrawing(newDrawing);
      setItems(prev => [...prev, newDrawing]);
      return;
    }

    if (isTextMode) {
      const newTextItem: TextItem = { id: `text_${Date.now()}`, type: 'text', x: point.x - 100, y: point.y - 25, width: 200, height: 50, text: '', rotation: 0, ...textOptions };
      setItems(prev => [...prev, newTextItem]);
      setEditingTextItem(newTextItem);
      onModeChange();
      gestureDidCommit.current = false;
      return;
    }

    const clickedItem = findItemAtPoint(point);

    if (clickedItem) {
        onModeChange();
        onSelectionChange(null, [clickedItem]); // Clear marquee selection, set single selection
        setSinglySelectedItemId(clickedItem.id);
        setInteractionMode('moving');
        setCurrentItem(clickedItem);
        setStartPoint(point);
        setOriginalItemState(clickedItem);
    } else {
        onModeChange();
        setSinglySelectedItemId(null);
        setInteractionMode('selecting');
        setStartPoint(point);
        setTransientSelectionRect({ ...point, width: 0, height: 0 });
        onSelectionChange(null, []);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const point = getCanvasPoint(e);

    if (interactionMode === 'none' && !isDrawingMode && !isTextMode && !magicFillState.isActive) {
        const itemUnderCursor = findItemAtPoint(point);
        setHoveredItemId(itemUnderCursor ? itemUnderCursor.id : null);
    } else if (hoveredItemId) {
        setHoveredItemId(null);
    }
    
    if (interactionMode === 'panning' && startPoint) {
        setPan({
            x: e.clientX - startPoint.x,
            y: e.clientY - startPoint.y,
        });
        return;
    }
    
    if (interactionMode === 'magicFill' && magicFillState.maskDrawing) {
        const newPoints = [...magicFillState.maskDrawing.points, point];
        onMaskUpdate({ ...magicFillState.maskDrawing, points: newPoints });
    } else if (interactionMode === 'drawing' && currentDrawing) {
        const newPoints = [...currentDrawing.points, point];
        const updatedDrawing = { ...currentDrawing, points: newPoints };
        setCurrentDrawing(updatedDrawing);
        setItems(prevItems => prevItems.map(item => item.id === updatedDrawing.id ? updatedDrawing : item), { commit: false });
    } else if (interactionMode === 'selecting' && startPoint) {
        setTransientSelectionRect({ x: Math.min(startPoint.x, point.x), y: Math.min(startPoint.y, point.y), width: Math.abs(point.x - startPoint.x), height: Math.abs(point.y - startPoint.y) });
    } else if (interactionMode === 'moving' && currentItem && startPoint && originalItemState) {
        const commit = !gestureDidCommit.current;
        const total_dx = point.x - startPoint.x;
        const total_dy = point.y - startPoint.y;

        setItems(prevItems => prevItems.map(item => {
            if (item.id !== currentItem.id) return item;
    
            const originalItem = originalItemState as CanvasItem;
    
            // Hold Shift to temporarily disable snapping
            const shouldSnap = gridOptions.isVisible && !e.shiftKey;
    
            if (originalItem.type === 'image' || originalItem.type === 'text' || originalItem.type === 'video') {
                let newX = originalItem.x + total_dx;
                let newY = originalItem.y + total_dy;
    
                if (shouldSnap) {
                    newX = Math.round(newX / gridOptions.spacing) * gridOptions.spacing;
                    newY = Math.round(newY / gridOptions.spacing) * gridOptions.spacing;
                }
                return { ...item, x: newX, y: newY };
            }
            if (originalItem.type === 'drawing') {
                let final_dx = total_dx;
                let final_dy = total_dy;
    
                if (shouldSnap) {
                    const originalBox = getBoundingBox(originalItem);
                    const newTopLeftX = originalBox.x + total_dx;
                    const newTopLeftY = originalBox.y + total_dy;
                    const snappedX = Math.round(newTopLeftX / gridOptions.spacing) * gridOptions.spacing;
                    const snappedY = Math.round(newTopLeftY / gridOptions.spacing) * gridOptions.spacing;
                    final_dx = snappedX - originalBox.x;
                    final_dy = snappedY - originalBox.y;
                }
                // Apply delta to the original points to avoid drift
                return { ...item, points: originalItem.points.map(p => ({ x: p.x + final_dx, y: p.y + final_dy })) };
            }
            return item;
        }), { commit });
        if (commit) gestureDidCommit.current = true;
    } else if (interactionMode === 'rotating' && currentItem && startPoint) {
        const commit = !gestureDidCommit.current;
        const { center, initialRotation } = originalItemState;
        const mousePos = { x: e.clientX, y: e.clientY };
        const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
        const currentAngle = Math.atan2(mousePos.y - center.y, mousePos.x - center.x);
        const angleDiff = (currentAngle - startAngle) * 180 / Math.PI;
        setItems(prev => prev.map(i => i.id === currentItem.id ? { ...i, rotation: initialRotation + angleDiff } : i), { commit });
        if (commit) gestureDidCommit.current = true;
    } else if (interactionMode === 'expanding' && activeHandle && originalItemState) {
        const { box: originalBox } = originalItemState;
        let { x, y, width, height } = originalBox;

        if (activeHandle.includes('n')) {
            const newY = Math.min(point.y, originalBox.y);
            height += originalBox.y - newY;
            y = newY;
        }
        if (activeHandle.includes('s')) {
            height = Math.max(originalBox.height, point.y - originalBox.y);
        }
        if (activeHandle.includes('w')) {
            const newX = Math.min(point.x, originalBox.x);
            width += originalBox.x - newX;
            x = newX;
        }
        if (activeHandle.includes('e')) {
            width = Math.max(originalBox.width, point.x - originalBox.x);
        }
        setExpansionGhostRect({ x, y, width, height });

    } else if (interactionMode === 'resizing' && currentItem && startPoint && activeHandle) {
        const commit = !gestureDidCommit.current;
        const { item: origItem, box: origBox, center: origCenter, oppositeCorner } = originalItemState;

        const currentMouseCanvas = getCanvasPoint(e);
        const vec = { x: currentMouseCanvas.x - oppositeCorner.x, y: currentMouseCanvas.y - oppositeCorner.y };
        const unrotatedVec = rotatePoint(vec, { x: 0, y: 0 }, -origItem.rotation);

        let newWidth = Math.abs(unrotatedVec.x);
        let newHeight = Math.abs(unrotatedVec.y);

        if (e.shiftKey && (origItem.type === 'image' || origItem.type === 'video')) {
            const aspectRatio = origBox.width / origBox.height;
            if (newWidth / newHeight > aspectRatio) {
                newHeight = newWidth / aspectRatio;
            } else {
                newWidth = newHeight * aspectRatio;
            }
        }
        
        if (newWidth < 10 || newHeight < 10) return;

        const newCenter = { x: (oppositeCorner.x + currentMouseCanvas.x) / 2, y: (oppositeCorner.y + currentMouseCanvas.y) / 2 };
        
        let newX = newCenter.x - newWidth / 2;
        let newY = newCenter.y - newHeight / 2;
        
        setItems(prev => prev.map(item => {
            if (item.id !== currentItem.id) return item;

            if (item.type === 'image' || item.type === 'text' || item.type === 'video') {
                return { ...item, x: newX, y: newY, width: newWidth, height: newHeight };
            }
            if (item.type === 'drawing') {
                const scaleX = newWidth / origBox.width;
                const scaleY = newHeight / origBox.height;
                const newPoints = item.points.map(p => {
                    const relativeP = { x: p.x - origCenter.x, y: p.y - origCenter.y };
                    const scaledP = { x: relativeP.x * scaleX, y: relativeP.y * scaleY };
                    return { x: scaledP.x + newCenter.x, y: scaledP.y + newCenter.y };
                });
                return { ...item, points: newPoints };
            }
            return item;
        }), { commit });
        if (commit) gestureDidCommit.current = true;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Don't stop panning on left mouse up if we are spacebar panning
    if (interactionMode === 'panning' && e.button === 0 && isSpacePanning) {
        return;
    }

    const wasModifying = ['moving', 'drawing', 'resizing', 'rotating', 'magicFill', 'expanding'].includes(interactionMode);
    
    gestureDidCommit.current = false;

    if (interactionMode === 'expanding' && expansionGhostRect && activeHandle) {
        onExpansionAreaDefined(expansionGhostRect, activeHandle);
        setExpansionGhostRect(null);
    }
      
    if (interactionMode === 'selecting' && transientSelectionRect) {
        const selected = items.filter(item => isItemInSelection(item, transientSelectionRect));
        if (selected.length > 0 && transientSelectionRect.width > 5 && transientSelectionRect.height > 5) {
            const boxes = selected.map(getRotatedBoundingBox);

            const minX = Math.min(...boxes.map(b => b.x));
            const minY = Math.min(...boxes.map(b => b.y));
            const maxX = Math.max(...boxes.map(b => b.x + b.width));
            const maxY = Math.max(...boxes.map(b => b.y + b.height));

            const encompassingRect: SelectionRect = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
            };
            
            onSelectionChange(encompassingRect, selected);
            setSinglySelectedItemId(null);
        } else {
            onSelectionChange(null, []);
        }
    }

    if (wasModifying) {
        onInteractionEnd();
    }

    setInteractionMode('none');
    setStartPoint(null);
    setCurrentItem(null);
    setCurrentDrawing(null);
    setTransientSelectionRect(null);
    setActiveHandle(null);
    setOriginalItemState(null);
  };
  
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === ' ' && !isSpacePanning) {
                setIsSpacePanning(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === ' ') {
                setIsSpacePanning(false);
                if (interactionMode === 'panning') {
                   setInteractionMode('none');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isSpacePanning, interactionMode]);
    
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (editingTextItem || isDrawingMode || isTextMode || expansionState.isActive) return;
        
        const point = getCanvasPoint(e);
        const item = findItemAtPoint(point);
        
        onShowContextMenu({ x: e.clientX, y: e.clientY, canvasPoint: point, item: item ?? undefined });

        if (item) {
            // Select the item on right click
            onSelectionChange(null, [item]);
            setSinglySelectedItemId(item.id);
        }
    }

  const getCursor = () => {
      if (magicFillState.isActive) {
          const point = getCanvasPoint({ clientX: lastMousePos.x, clientY: lastMousePos.y } as React.MouseEvent);
          const targetItem = items.find(i => i.id === magicFillState.targetItemId);
          if (targetItem && isPointInBox(point, getRotatedBoundingBox(targetItem))) {
              return 'crosshair';
          }
      }
      if (interactionMode === 'panning') return 'grabbing';
      if (isSpacePanning) return 'grab';
      if (isDrawingMode) return 'crosshair';
      if (isTextMode) return 'text';
      return 'default';
  }

  // Track mouse position for cursor changes
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const handleMouseMoveForCursor = (e: React.MouseEvent<HTMLDivElement>) => {
    setLastMousePos({ x: e.clientX, y: e.clientY });
    handleMouseMove(e);
  };


  const selectedItemForBox = singlySelectedItemId ? items.find(i => i.id === singlySelectedItemId) : null;
  const allItemsToRender = previewItem ? [...items, previewItem] : items;
  
  const getBackgroundStyle = () => {
    const styles: React.CSSProperties = {
        backgroundColor: '#111827',
    };
    
    const backgrounds = [
        'radial-gradient(circle, #374151 1px, rgba(0, 0, 0, 0) 1px)'
    ];
    const sizes = [`${20 * zoom}px ${20 * zoom}px`];
    const positions = [`${pan.x}px ${pan.y}px`];

    if (gridOptions.isVisible) {
        const gridSpacingZoomed = gridOptions.spacing * zoom;
        const gridColor = gridOptions.color;
        
        // Vertical lines
        backgrounds.push(`repeating-linear-gradient(to right, ${gridColor}, ${gridColor} 1px, transparent 1px, transparent 100%)`);
        sizes.push(`${gridSpacingZoomed}px ${gridSpacingZoomed}px`);
        positions.push(`${pan.x}px ${pan.y}px`);
        
        // Horizontal lines
        backgrounds.push(`repeating-linear-gradient(to bottom, ${gridColor}, ${gridColor} 1px, transparent 1px, transparent 100%)`);
        sizes.push(`${gridSpacingZoomed}px ${gridSpacingZoomed}px`);
        positions.push(`${pan.x}px ${pan.y}px`);
    }

    styles.backgroundImage = backgrounds.join(', ');
    styles.backgroundSize = sizes.join(', ');
    styles.backgroundPosition = positions.join(', ');
    
    return styles;
  }

  return (
    <div 
        ref={canvasRef}
        className="relative w-full h-full overflow-hidden"
        style={{ 
            cursor: getCursor(),
            ...getBackgroundStyle(),
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveForCursor}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
    >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: '100%', height: '100%' }}>
            {allItemsToRender.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-2xl pointer-events-none">
                    <p>Add an image, text, or drawing to begin</p>
                </div>
            )}
            {allItemsToRender.map(item => {
                const isMarqueeSelected = selectionRect ? isItemInSelection(item, selectionRect) : false;
                const isHovered = item.id === hoveredItemId && !selectedItemForBox && !selectionRect;
                const isGhosted = ghostedItemIds.includes(item.id);
                const isPreview = item.id === previewItem?.id;
                const isMagicFillTarget = magicFillState.isActive && item.id === magicFillState.targetItemId;
                const isMagicFillSource = magicFillState.isActive && item.id === magicFillState.sourceItemId;

                let itemClass = 'transition-all duration-150';
                if (isMarqueeSelected) itemClass += ' ring-2 ring-purple-500';
                if (isHovered) itemClass += ' outline outline-2 outline-offset-2 outline-blue-400';
                if (isPreview) itemClass += ' ring-2 ring-dashed ring-green-400 opacity-90';
                if (isMagicFillTarget) itemClass += ' ring-4 ring-offset-2 ring-indigo-500 animate-pulse';
                if (isMagicFillSource) itemClass += ' ring-2 ring-offset-2 ring-green-500';


                const baseStyle: React.CSSProperties = { position: 'absolute', transformOrigin: 'center center', opacity: isGhosted ? 0.4 : 1 };

                switch (item.type) {
                case 'image':
                    return <img key={item.id} src={item.src} alt={item.prompt} style={{ ...baseStyle, left: item.x, top: item.y, width: item.width, height: item.height, transform: `rotate(${item.rotation}deg)` }} className={`object-contain pointer-events-none ${itemClass}`} />;
                case 'video':
                    return <video key={item.id} src={item.src} style={{ ...baseStyle, left: item.x, top: item.y, width: item.width, height: item.height, transform: `rotate(${item.rotation}deg)` }} className={`object-contain pointer-events-none ${itemClass}`} autoPlay loop muted playsInline />;
                case 'text':
                    if (editingTextItem?.id === item.id) {
                    return <textarea
                        key={item.id} value={item.text} onChange={(e) => handleTextChange(e, item)} onBlur={handleTextBlur} autoFocus
                        placeholder="Type here..."
                        style={{ ...baseStyle, left: item.x, top: item.y, width: item.width, height: 'auto', minHeight: item.height, color: item.color, fontSize: `${item.fontSize}px`, textShadow: '0 1px 3px rgba(0,0,0,0.5)', transform: `rotate(${item.rotation}deg)`}}
                        className="bg-transparent p-2 border-2 border-purple-500 rounded-md resize-none focus:outline-none"
                    />
                    }
                    return <div key={item.id} style={{ ...baseStyle, left: item.x, top: item.y, width: item.width, height: 'auto', textShadow: '0 1px 3px rgba(0,0,0,0.5)', whiteSpace: 'pre-wrap', wordWrap: 'break-word', color: item.color, fontSize: `${item.fontSize}px`, transform: `rotate(${item.rotation}deg)`}} className={`p-2 ${isGhosted || isPreview ? 'pointer-events-none' : ''} ${itemClass}`}>
                    {item.text}
                    </div>;
                case 'drawing': {
                    const box = getBoundingBox(item);
                    if (!box || box.width <= 0 || box.height <= 0) return null;

                    // Make path coordinates relative to the bounding box's top-left corner.
                    const pathData = item.points.map((p, i) => {
                        const relX = p.x - box.x;
                        const relY = p.y - box.y;
                        return (i === 0 ? 'M' : 'L') + `${relX} ${relY}`;
                    }).join(' ');

                    const drawingStyle: React.CSSProperties = {
                        ...baseStyle,
                        left: box.x,
                        top: box.y,
                        width: box.width,
                        height: box.height,
                        transform: `rotate(${item.rotation}deg)`,
                        transformOrigin: 'center center',
                        pointerEvents: 'none',
                    };

                    return (
                        // Apply itemClass here for consistent selection rings
                        <div key={item.id} style={drawingStyle} className={itemClass}>
                             <svg 
                                width="100%" 
                                height="100%" 
                                viewBox={`0 0 ${box.width} ${box.height}`} 
                                style={{ overflow: 'visible' }}
                            >
                                <path 
                                    d={pathData} 
                                    // Marquee selection is now handled by itemClass on the div.
                                    stroke={isHovered ? '#60A5FA' : item.color} 
                                    strokeWidth={(isHovered ? item.strokeWidth + 2 : item.strokeWidth) / zoom} 
                                    fill="none" 
                                    strokeOpacity={isGhosted ? item.opacity * 0.5 : item.opacity} 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>
                    );
                }
                default:
                    return null;
                }
            })}

            {/* Render Magic Fill Mask */}
            {magicFillState.maskDrawing && magicFillState.maskDrawing.points.length > 1 && (() => {
              const item = magicFillState.maskDrawing;
              const box = getBoundingBox(item);
              if (!box || box.width <= 0 || box.height <= 0) return null;

              const pathData = item.points.map((p, i) => {
                  const relX = p.x - box.x;
                  const relY = p.y - box.y;
                  return (i === 0 ? 'M' : 'L') + `${relX} ${relY}`;
              }).join(' ');

              const drawingStyle: React.CSSProperties = {
                  position: 'absolute',
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  pointerEvents: 'none',
              };

              return (
                  <div style={drawingStyle}>
                        <svg 
                          width="100%" 
                          height="100%" 
                          viewBox={`0 0 ${box.width} ${box.height}`} 
                          style={{ overflow: 'visible' }}
                      >
                          <path 
                              d={pathData} 
                              stroke="rgba(239, 68, 68, 0.7)" 
                              strokeWidth={item.strokeWidth / zoom} 
                              fill="rgba(239, 68, 68, 0.4)"
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                          />
                      </svg>
                  </div>
              );
            })()}

            {selectedItemForBox && interactionMode !== 'selecting' && !selectionRect && !magicFillState.isActive && (
                <ControlBox box={getBoundingBox(selectedItemForBox)} rotation={selectedItemForBox.rotation} onHandleMouseDown={(e, handle) => handleInteractionStart(e, handle, selectedItemForBox)} />
            )}

            {expansionState.isActive && expansionState.targetItem && (
                <ControlBox box={getRotatedBoundingBox(expansionState.targetItem)} isExpansion={true} onHandleMouseDown={handleInteractionStart} />
            )}

            {(selectionRect || transientSelectionRect || expansionGhostRect) && (
                <div 
                className="absolute border-2 border-dashed border-purple-500 bg-purple-500/20 pointer-events-none"
                style={{ 
                    left: (expansionGhostRect || transientSelectionRect || selectionRect)!.x, 
                    top: (expansionGhostRect || transientSelectionRect || selectionRect)!.y, 
                    width: (expansionGhostRect || transientSelectionRect || selectionRect)!.width, 
                    height: (expansionGhostRect || transientSelectionRect || selectionRect)!.height,
                    borderColor: expansionGhostRect ? '#22c55e' : '#a855f7',
                    backgroundColor: expansionGhostRect ? 'rgba(34,197,94,0.2)' : 'rgba(168,85,247,0.2)',
                }}
                />
            )}
        </div>
    </div>
  );
};

export default React.memo(Canvas);