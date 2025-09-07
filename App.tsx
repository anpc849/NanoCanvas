import React, { useState, useCallback, useEffect, useRef } from 'react';
import Canvas, { Handle } from './components/Canvas';
import Toolbar, { MagicFillMode } from './components/Toolbar';
import ProgressPanel from './components/ProgressPanel';
import ReplacementConfirmation from './components/ReplacementConfirmation';
import ContextMenu from './components/ContextMenu';
import PromptModal from './components/PromptModal';
import SettingsModal from './components/SettingsModal';
import MagicFillPrompt from './components/MagicFillPrompt';
import { CanvasItem, ImageItem, SelectionRect, TextItem, DrawingOptions, TextOptions, GenerationTask, ImagePreview, Point, DrawingItem, MagicFillState, VideoItem, GridOptions, ModelSettings, AVAILABLE_MODELS } from './types';
import { interpretCanvas, generateImage, editImageWithMask, generateVideo, generateOutpaintedImage, interpretMagicFill } from './services/geminiService';
import { useHistory } from './hooks/useHistory';
import { SendIcon, TrashIcon, VideoIcon, LoadingSpinner, MagicWandIcon } from './components/icons';
import { convertDrawingToImageItem, createCanvasSnapshot, createMaskImageFromDrawing, createImageForOutpainting, createOutpaintingMask } from './utils/canvasUtils';
import { getRotatedBoundingBox } from './utils/geometry';

interface SelectionPromptBarProps {
  selectionRect: SelectionRect;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: (generator: 'image' | 'video') => void;
  onInterpret: () => void;
  onDelete: () => void;
  itemCount: number;
  zoom: number;
  pan: Point;
  disabled: boolean;
  isInterpreting: boolean;
}


const ApiKeyWarningBanner = () => (
    <div className="absolute top-0 left-0 right-0 bg-yellow-500/90 text-black p-3 text-center z-50 text-sm font-semibold backdrop-blur-sm">
        ⚠️ Gemini API Key is not configured. Generation features are disabled. Please set the <code>API_KEY</code> environment variable.
    </div>
);

const SelectionPromptBar: React.FC<SelectionPromptBarProps> = ({ 
    selectionRect, prompt, onPromptChange, onGenerate, onInterpret, onDelete, 
    itemCount, zoom, pan, disabled, isInterpreting 
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const barWidth = Math.max(350, Math.min(550, selectionRect.width * zoom));
    
    const screenRectTop = selectionRect.y * zoom + pan.y;
    const screenRectLeft = selectionRect.x * zoom + pan.x;
    const screenRectWidth = selectionRect.width * zoom;
    
    const left = screenRectLeft + screenRectWidth / 2 - barWidth / 2;
    const top = screenRectTop + (selectionRect.height * zoom) + 10;
    
    const PADDING = 10;
    const boundedLeft = Math.max(PADDING, Math.min(left, window.innerWidth - barWidth - PADDING));

    setPosition({ top, left: boundedLeft, width: barWidth });
  }, [selectionRect, zoom, pan]);

  const handleSubmit = (e: React.FormEvent, generator: 'image' | 'video') => {
    e.preventDefault();
    if (!disabled) {
      onGenerate(generator);
    }
  };
  
  const placeholderText = itemCount > 0 
    ? `Describe how to change the ${itemCount} selected item(s), or leave blank...`
    : 'Describe what you want to generate here...';

  return (
    <form 
      onSubmit={(e) => handleSubmit(e, 'image')}
      className="absolute z-10 bg-gray-800/60 backdrop-blur-md rounded-xl shadow-2xl p-2 flex items-center border border-gray-700 transition-all duration-300 animate-fade-in-up space-x-2"
      style={{ top: position.top, left: position.left, width: position.width, transform: 'translateZ(0)' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={placeholderText}
        className="flex-grow bg-transparent text-white placeholder-gray-400 focus:outline-none px-2"
        autoFocus
      />
      <button
        type="button"
        onClick={onInterpret}
        title="Let AI generate a prompt based on the selection"
        disabled={disabled || isInterpreting}
        className="p-2 rounded-lg flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 text-gray-200 hover:bg-indigo-500 hover:text-white focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {isInterpreting ? <LoadingSpinner className="w-5 h-5" /> : <MagicWandIcon className="w-5 h-5" />}
      </button>
      <button
        type="submit"
        title="Generate Image"
        disabled={disabled}
        className="p-2 rounded-lg flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 bg-green-600 text-white hover:bg-green-500 focus:ring-green-500 disabled:bg-gray-600 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <SendIcon className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={(e) => handleSubmit(e, 'video')}
        title="Generate Video"
        disabled={disabled}
        className="p-2 rounded-lg flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 bg-indigo-600 text-white hover:bg-indigo-500 focus:ring-indigo-500 disabled:bg-gray-600 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <VideoIcon className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete Selected Items (Delete)"
        className="p-2 rounded-lg flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 bg-red-600 text-white hover:bg-red-500 focus:ring-red-500"
      >
        <TrashIcon className="w-5 h-5" />
      </button>
    </form>
  );
};

const convertImageToSupportedFormat = (
    dataUrl: string,
    originalMimeType: string
): Promise<{ src: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
        const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (supportedTypes.includes(originalMimeType)) {
            resolve({ src: dataUrl, mimeType: originalMimeType });
            return;
        }

        console.log(`Converting unsupported image type '${originalMimeType}' to 'image/png'.`);

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context for image conversion.'));
                return;
            }
            ctx.drawImage(img, 0, 0);
            const pngDataUrl = canvas.toDataURL('image/png');
            resolve({ src: pngDataUrl, mimeType: 'image/png' });
        };
        img.onerror = (err) => {
            console.error("Image load error during conversion:", err);
            reject(new Error('Failed to load image for conversion. It might be in an unsupported format or corrupt.'));
        };
        img.src = dataUrl;
    });
};

const getResizedImageItem = (item: ImageItem): Promise<ImageItem> => {
    return new Promise((resolve, reject) => {
        const MAX_DIMENSION = 1024; // A reasonable size for the model
        const img = new Image();

        img.onload = () => {
            let { width, height } = img;

            // Only resize if the image is larger than the max dimension
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                if (width > height) {
                    height = Math.round(height * (MAX_DIMENSION / width));
                    width = MAX_DIMENSION;
                } else {
                    width = Math.round(width * (MAX_DIMENSION / height));
                    height = MAX_DIMENSION;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not create canvas context for resizing.'));

            // Use high-quality downscaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(img, 0, 0, width, height);
            
            const resizedSrc = canvas.toDataURL('image/png');
            
            resolve({
                ...item,
                src: resizedSrc,
                mimeType: 'image/png',
            });
        };
        img.onerror = (err) => reject(new Error('Failed to load image for resizing: ' + err));
        img.crossOrigin = "anonymous";
        img.src = item.src;
    });
};

interface ContextMenuData {
  x: number;
  y: number;
  canvasPoint: Point;
  item?: CanvasItem;
}

interface ExpansionGenerationInfo {
    targetItem: ImageItem;
    rect: SelectionRect;
    direction: Handle;
}

/**
 * Loads state from localStorage.
 * @param key The key to load from.
 * @param defaultValue The default value if the key is not found or parsing fails.
 * @returns The parsed state or the default value.
 */
const loadState = <T,>(key: string, defaultValue: T): T => {
    try {
        const savedState = localStorage.getItem(key);
        if (savedState) {
            return JSON.parse(savedState);
        }
    } catch (e) {
        console.error(`Failed to load state for key "${key}" from localStorage`, e);
    }
    return defaultValue;
};

/**
 * Saves state to localStorage.
 * @param key The key to save to.
 * @param state The state to save.
 */
const saveState = <T,>(key: string, state: T) => {
    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
        console.error(`Failed to save state for key "${key}" to localStorage`, e);
    }
};


/**
 * Loads initial canvas items from localStorage, filtering out videos.
 * Video items are not persisted because their blob URLs are session-specific.
 * @returns The array of canvas items.
 */
const loadInitialItems = (): CanvasItem[] => {
    try {
        const savedItems = localStorage.getItem('canvasItems');
        if (savedItems) {
            const parsedItems = JSON.parse(savedItems) as CanvasItem[];
            // Filter out video items as their blob URLs are temporary and won't work after a refresh.
            return parsedItems.filter(item => item.type !== 'video');
        }
    } catch (e) {
        console.error("Failed to load canvas items from localStorage", e);
    }
    return [];
};


function App() {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);
  
  const markChangesAsUnsaved = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  const { state: items, setState: setItems, undo, redo, canUndo, canRedo } = useHistory<CanvasItem[]>(
    loadInitialItems(),
    markChangesAsUnsaved
  );

  const handleSave = useCallback(() => {
    const persistentItems = items.filter(item => item.type !== 'video');
    saveState('canvasItems', persistentItems);
    setHasUnsavedChanges(false);
  }, [items]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        event.preventDefault();
        event.returnValue = ''; // Required for Chrome
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);
  
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [selectedItems, setSelectedItems] = useState<CanvasItem[]>([]);
  const [selectionPrompt, setSelectionPrompt] = useState('');
  const [isInterpreting, setIsInterpreting] = useState(false);

  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(() => loadState('isPanelOpen', true));
  
  const [drawingOptions, setDrawingOptions] = useState<DrawingOptions>(() => loadState('drawingOptions', {
    color: '#FFFFFF',
    strokeWidth: 5,
    opacity: 1,
  }));

  const [textOptions, setTextOptions] = useState<TextOptions>(() => loadState('textOptions', {
    color: '#FFFFFF',
    fontSize: 24,
  }));

  const [gridOptions, setGridOptions] = useState<GridOptions>(() => loadState('gridOptions', {
    isVisible: false,
    spacing: 50,
    color: 'rgba(128, 128, 128, 0.5)',
  }));

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [zoom, setZoom] = useState<number>(() => loadState('zoom', 1));
  const [pan, setPan] = useState<Point>(() => loadState('pan', { x: 0, y: 0 }));
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [generationPromptModal, setGenerationPromptModal] = useState<{isOpen: boolean; position: Point | null}>({isOpen: false, position: null});
  const [isApiKeyConfigured, setIsApiKeyConfigured] = useState(true);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => loadState('modelSettings', {
    textToImage: AVAILABLE_MODELS.textToImage[0],
    canvasToImage: AVAILABLE_MODELS.canvasToImage[0],
    video: AVAILABLE_MODELS.video[0],
    interpretation: AVAILABLE_MODELS.interpretation[0],
  }));

  const [magicFillState, setMagicFillState] = useState<MagicFillState>({
    isActive: false,
    targetItemId: null,
    sourceItemId: null,
    maskDrawing: null,
  });
  
  const [expansionState, setExpansionState] = useState<{ isActive: boolean; targetItem: ImageItem | null; }>({ isActive: false, targetItem: null });
  const [expansionGenerationInfo, setExpansionGenerationInfo] = useState<ExpansionGenerationInfo | null>(null);

  // --- State Persistence Effects ---
  useEffect(() => { saveState('isPanelOpen', isPanelOpen); }, [isPanelOpen]);
  useEffect(() => { saveState('drawingOptions', drawingOptions); }, [drawingOptions]);
  useEffect(() => { saveState('textOptions', textOptions); }, [textOptions]);
  useEffect(() => { saveState('gridOptions', gridOptions); }, [gridOptions]);
  useEffect(() => { saveState('zoom', zoom); }, [zoom]);
  useEffect(() => { saveState('pan', pan); }, [pan]);
  useEffect(() => { saveState('modelSettings', modelSettings); }, [modelSettings]);
  // --- End State Persistence Effects ---

  useEffect(() => {
    if (!process.env.API_KEY) {
      console.warn("API_KEY environment variable not set. Generation features will be disabled.");
      setIsApiKeyConfigured(false);
    }
  }, []);
  
  useEffect(() => {
    if (!selectionRect) {
        setSelectionPrompt('');
    }
  }, [selectionRect]);

  const addImageToCanvas = useCallback(async (file: File, position?: { x: number; y: number }) => {
    if (!file || !file.type.startsWith('image/')) {
        console.warn('Attempted to add a non-image file.');
        return;
    }

    try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });

        const { src: convertedSrc, mimeType: convertedMimeType } = await convertImageToSupportedFormat(dataUrl, file.type);
        
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = (err) => reject(new Error('Failed to load processed image: ' + err));
            image.src = convertedSrc;
        });
        
        const maxWidth = 300;
        const newWidth = img.width > maxWidth ? maxWidth : img.width;
        const newHeight = img.height * (newWidth / img.width);
        
        const canvasCenterX = (window.innerWidth / 2 - pan.x) / zoom;
        const canvasCenterY = (window.innerHeight / 2 - pan.y) / zoom;

        const dropX = position ? position.x : canvasCenterX;
        const dropY = position ? position.y : canvasCenterY;

        const newImage: ImageItem = {
          id: `img_${Date.now()}`,
          type: 'image',
          x: dropX - newWidth / 2,
          y: dropY - newHeight / 2,
          width: newWidth,
          height: newHeight,
          src: convertedSrc,
          mimeType: convertedMimeType,
          prompt: file.name || 'pasted/dropped image',
          rotation: 0,
        };
        setItems(prev => [...prev, newImage]);
    } catch (error) {
        console.error("Error adding image to canvas:", error);
        alert("Sorry, there was an issue processing that image. It might be in an unsupported format or corrupt.");
    }
  }, [zoom, pan, setItems]);

  const updateTask = useCallback((taskId: string, updates: Partial<Omit<GenerationTask, 'log'>> & { logEntry?: GenerationTask['log'][0] }) => {
    setGenerationTasks(prevTasks =>
      prevTasks.map(task => {
        if (task.id === taskId) {
          const { logEntry, ...restOfUpdates } = updates;
          const newLog = logEntry ? [...task.log, logEntry] : task.log;
          return { ...task, ...restOfUpdates, log: newLog };
        }
        return task;
      })
    );
  }, []);

  const startImageGeneration = useCallback(async (prompt: string | null, itemsForTask: CanvasItem[], rectForTask: SelectionRect, modelOverride?: string) => {
    if (!isApiKeyConfigured) return;
    if (!isPanelOpen) setIsPanelOpen(true);
    if (imagePreview) return;

    const taskId = `task_${Date.now()}`;
    const initialTask: GenerationTask = {
        id: taskId,
        type: 'standard',
        status: 'interpreting',
        log: [{ type: 'status', message: 'Starting image generation...' }],
        selectionRect: rectForTask,
    };
    setGenerationTasks(prev => [initialTask, ...prev]);

    try {
        let finalPrompt: string;
        
        updateTask(taskId, { logEntry: { type: 'status', message: 'Step 1: Taking snapshot of canvas selection...' } });
        const snapshotDataUrl = await createCanvasSnapshot(items, rectForTask);

        if (itemsForTask.length > 0 || !prompt) {
            updateTask(taskId, { logEntry: { type: 'status', message: 'Step 2: Analyzing layout to create prompt...' } });
            const optimizedPrompt = await interpretCanvas(snapshotDataUrl, itemsForTask, prompt, modelSettings.interpretation);
            updateTask(taskId, { logEntry: { type: 'prompt', message: `Optimized Prompt: ${optimizedPrompt}` } });
            finalPrompt = optimizedPrompt.trim();
        } else {
            finalPrompt = prompt.trim();
            updateTask(taskId, { logEntry: { type: 'prompt', message: `Using direct prompt: ${finalPrompt}` } });
        }

        if (!finalPrompt) throw new Error("A prompt is required to generate an image.");
        
        updateTask(taskId, { status: 'generating', logEntry: { type: 'status', message: 'Step 3: Preparing visual inputs...' } });
        const imageItemsForTask = itemsForTask.filter(item => item.type === 'image') as ImageItem[];
        const drawingItemsForGeneration = itemsForTask.filter(item => item.type === 'drawing') as DrawingItem[];
        const resizedImageItems = await Promise.all(imageItemsForTask.map(getResizedImageItem));
        const drawingsAsImagesNullable = await Promise.all(drawingItemsForGeneration.map(convertDrawingToImageItem));
        const drawingsAsImages = drawingsAsImagesNullable.filter((img): img is ImageItem => img !== null);
        const allVisualInputs = [...resizedImageItems, ...drawingsAsImages];

        updateTask(taskId, { logEntry: { type: 'status', message: 'Step 4: Starting generation...' } });
        
        const onStepUpdate = (message: string) => {
            if (message.startsWith('Model Plan:')) {
                    updateTask(taskId, { logEntry: { type: 'prompt', message } });
            } else {
                    updateTask(taskId, { logEntry: { type: 'status', message } });
            }
        };

        const isTextToImage = allVisualInputs.length === 0 && itemsForTask.length === 0;
        const modelToUse = modelOverride || (isTextToImage ? modelSettings.textToImage : modelSettings.canvasToImage);
        updateTask(taskId, { logEntry: { type: 'status', message: `Using model: ${modelToUse}` } });

        const result = await generateImage(finalPrompt, allVisualInputs, snapshotDataUrl, onStepUpdate, modelToUse);

        const img = new Image();
        img.onload = () => {
            const newImage: ImageItem = {
                id: `gen_${taskId}`, type: 'image',
                x: rectForTask.x,
                y: rectForTask.y,
                width: rectForTask.width, height: rectForTask.height,
                src: `data:${result.mimeType};base64,${result.base64}`,
                mimeType: result.mimeType, prompt: finalPrompt!, rotation: 0,
            };
            
            setImagePreview({ newImage, itemsToReplace: itemsForTask });
        };
        img.src = `data:${result.mimeType};base64,${result.base64}`;

        updateTask(taskId, { status: 'completed', logEntry: { type: 'result', message: 'Image generated successfully.' } });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Generation failed:", error);
        updateTask(taskId, {
            status: 'error',
            error: errorMessage,
            logEntry: { type: 'result', message: `Error: ${errorMessage}` }
        });
    }
}, [isPanelOpen, updateTask, imagePreview, isApiKeyConfigured, items, modelSettings]);
    
  const startVideoGeneration = useCallback(async (prompt: string | null, itemsForTask: CanvasItem[], rectForTask: SelectionRect) => {
    if (!isApiKeyConfigured) return;
    if (!isPanelOpen) setIsPanelOpen(true);
    if (imagePreview) return; // Prevent new generations while preview is active

    const taskId = `task_${Date.now()}`;
    const initialTask: GenerationTask = {
        id: taskId, type: 'video', status: 'interpreting',
        log: [{ type: 'status', message: 'Starting video generation...' }],
        selectionRect: rectForTask,
    };
    setGenerationTasks(prev => [initialTask, ...prev]);

    try {
        updateTask(taskId, { logEntry: { type: 'status', message: 'Step 1: Taking snapshot of scene...' } });
        const snapshotDataUrl = await createCanvasSnapshot(items, rectForTask);

        let finalPrompt: string;
        if (itemsForTask.length > 0 || !prompt) {
            updateTask(taskId, { logEntry: { type: 'status', message: 'Step 2: Analyzing layout to create animation prompt...' } });
            const optimizedPrompt = await interpretCanvas(snapshotDataUrl, itemsForTask, prompt, modelSettings.interpretation);
            updateTask(taskId, { logEntry: { type: 'prompt', message: `Animation Prompt: ${optimizedPrompt}` } });
            finalPrompt = optimizedPrompt.trim();
        } else {
            finalPrompt = prompt.trim();
            updateTask(taskId, { logEntry: { type: 'prompt', message: `Using direct prompt: ${finalPrompt}` } });
        }
        if (!finalPrompt) throw new Error("A prompt is required to generate a video.");

        updateTask(taskId, { status: 'generating', logEntry: { type: 'status', message: 'Step 3: Sending request to video model...' } });
        updateTask(taskId, { logEntry: { type: 'status', message: `Using model: ${modelSettings.video}` } });
        
        const onStepUpdate = (message: string) => {
            updateTask(taskId, { logEntry: { type: 'status', message } });
        };
        
        const result = await generateVideo(finalPrompt, snapshotDataUrl, onStepUpdate, modelSettings.video);

        const videoUrl = URL.createObjectURL(result.videoBlob);
        const videoElement = document.createElement('video');
        videoElement.onloadedmetadata = () => {
            const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
            let newWidth = rectForTask.width > 0 ? Math.min(videoElement.videoWidth, rectForTask.width) : Math.min(videoElement.videoWidth, 512);
            let newHeight = newWidth / aspectRatio;
             if (rectForTask.height > 0 && newHeight > rectForTask.height) {
                newHeight = rectForTask.height;
                newWidth = newHeight * aspectRatio;
            }
            
            const newVideo: VideoItem = {
                id: `vid_${taskId}`, type: 'video',
                x: rectForTask.x + (rectForTask.width - newWidth) / 2,
                y: rectForTask.y + (rectForTask.height - newHeight) / 2,
                width: newWidth, height: newHeight,
                src: videoUrl, mimeType: result.mimeType, prompt: finalPrompt, rotation: 0
            };

            setItems(prev => prev.filter(item => !itemsForTask.find(i => i.id === item.id)).concat(newVideo));
        };
        videoElement.src = videoUrl;

        updateTask(taskId, { status: 'completed', logEntry: { type: 'result', message: 'Video generated successfully.' } });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Video generation failed:", error);
        updateTask(taskId, {
            status: 'error', error: errorMessage,
            logEntry: { type: 'result', message: `Error: ${errorMessage}` }
        });
    }
  }, [isPanelOpen, updateTask, setItems, imagePreview, isApiKeyConfigured, items, modelSettings]);

  const startMagicFillGeneration = useCallback(async (prompt: string) => {
    if (!isApiKeyConfigured || !magicFillState.targetItemId || !magicFillState.maskDrawing) return;

    const targetItem = items.find(item => item.id === magicFillState.targetItemId) as ImageItem;
    if (!targetItem) return;

    const sourceItem = magicFillState.sourceItemId 
      ? items.find(item => item.id === magicFillState.sourceItemId) as ImageItem 
      : null;
    
    const maskDrawing = magicFillState.maskDrawing;

    if (!isPanelOpen) setIsPanelOpen(true);
    const taskId = `task_${Date.now()}`;
    const initialTask: GenerationTask = {
        id: taskId, type: 'magic-fill', status: 'interpreting',
        log: [{ type: 'status', message: `Starting Magic ${sourceItem ? 'Replace' : 'Fill'} on '${targetItem.prompt}'...` }],
        selectionRect: getRotatedBoundingBox(targetItem),
    };
    setGenerationTasks(prev => [initialTask, ...prev]);
    
    setMagicFillState({ isActive: false, targetItemId: null, sourceItemId: null, maskDrawing: null });

    try {
        updateTask(taskId, { logEntry: { type: 'status', message: 'Step 1: Analyzing mask and context...' } });

        const itemsForSnapshot = [targetItem, maskDrawing];
        const rectForSnapshot = getRotatedBoundingBox(targetItem);
        const snapshotDataUrl = await createCanvasSnapshot(itemsForSnapshot, rectForSnapshot);

        const finalPrompt = await interpretMagicFill(snapshotDataUrl, sourceItem, prompt, modelSettings.interpretation);

        updateTask(taskId, { logEntry: { type: 'prompt', message: `Optimized Prompt: ${finalPrompt}` } });
        updateTask(taskId, { status: 'generating', logEntry: { type: 'status', message: 'Step 2: Creating mask from drawing...' } });
        
        const maskImageBase64 = await createMaskImageFromDrawing(maskDrawing, targetItem);
        
        updateTask(taskId, { logEntry: { type: 'status', message: `Step 3: Sending image, mask, and prompt to AI (${modelSettings.canvasToImage})...` } });

        const result = await editImageWithMask(targetItem, maskImageBase64, finalPrompt, sourceItem);

        updateTask(taskId, { logEntry: { type: 'status', message: 'Step 4: Receiving edited image...' } });

        const img = new Image();
        img.onload = () => {
            const newImageItem: ImageItem = {
                ...targetItem, id: `gen_${taskId}`,
                src: `data:${result.mimeType};base64,${result.base64}`,
                mimeType: result.mimeType, prompt: finalPrompt,
                width: targetItem.width, height: targetItem.height,
            };
            setItems(prev => prev.map(item => item.id === targetItem.id ? newImageItem : item));
        };
        img.src = `data:${result.mimeType};base64,${result.base64}`;

        updateTask(taskId, { status: 'completed', logEntry: { type: 'result', message: 'Magic Fill successful.' } });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Magic Fill failed:", error);
        updateTask(taskId, {
            status: 'error', error: errorMessage,
            logEntry: { type: 'result', message: `Error: ${errorMessage}` }
        });
    }
  }, [isApiKeyConfigured, magicFillState, items, isPanelOpen, updateTask, setItems, modelSettings]);

  const startExpansionGeneration = useCallback(async (prompt: string, info: ExpansionGenerationInfo) => {
    if (!isApiKeyConfigured) return;

    const { targetItem, rect: combinedRect } = info;
    if (!isPanelOpen) setIsPanelOpen(true);

    const taskId = `task_${Date.now()}`;
    const initialTask: GenerationTask = {
        id: taskId, type: 'standard', status: 'interpreting',
        log: [{ type: 'status', message: `Starting Generative Expand...` }],
        selectionRect: combinedRect,
    };
    setGenerationTasks(prev => [initialTask, ...prev]);

    try {
        updateTask(taskId, { logEntry: { type: 'status', message: 'Step 1: Preparing image and canvas for expansion...' } });
        const { enlargedImageBase64, placement } = await createImageForOutpainting(targetItem, combinedRect);
        
        const snapshotDataUrl = enlargedImageBase64;
        
        let interpretationPrompt = "This is a generative expansion task. The goal is to fill the empty space around the existing image.";
        if (prompt && prompt.trim()) {
            interpretationPrompt += ` The user's guidance is: "${prompt.trim()}".`;
        } else {
            interpretationPrompt += " Intelligently expand the image to fill the canvas with a plausible continuation of the scene.";
        }

        updateTask(taskId, { status: 'interpreting', logEntry: { type: 'status', message: 'Step 2: Analyzing scene to create optimized prompt...' } });
        const optimizedPrompt = await interpretCanvas(snapshotDataUrl, [targetItem], interpretationPrompt, modelSettings.interpretation);
        updateTask(taskId, { logEntry: { type: 'prompt', message: `Optimized Prompt: ${optimizedPrompt}` } });
        
        const finalPrompt = optimizedPrompt.trim();
        if (!finalPrompt) throw new Error("The AI failed to generate an expansion prompt.");

        updateTask(taskId, { status: 'generating', logEntry: { type: 'status', message: `Step 3: Creating mask and sending request to AI (${modelSettings.canvasToImage})...` } });
        const maskImageBase64 = createOutpaintingMask(combinedRect.width, combinedRect.height, placement);
        
        const result = await generateOutpaintedImage(enlargedImageBase64, maskImageBase64, finalPrompt);
        
        const expandedImageItem: ImageItem = {
            ...targetItem,
            id: `gen_${taskId}`,
            x: combinedRect.x,
            y: combinedRect.y,
            width: combinedRect.width,
            height: combinedRect.height,
            src: `data:${result.mimeType};base64,${result.base64}`,
            mimeType: result.mimeType,
            prompt: `Expanded: ${prompt || 'auto'}`,
        };
        
        setItems(prev => prev.map(item => item.id === targetItem.id ? expandedImageItem : item));
        updateTask(taskId, { status: 'completed', logEntry: { type: 'result', message: 'Expansion successful.' } });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Expansion failed:", error);
        updateTask(taskId, {
            status: 'error', error: errorMessage,
            logEntry: { type: 'result', message: `Error: ${errorMessage}` }
        });
    }
  }, [isApiKeyConfigured, isPanelOpen, updateTask, setItems, modelSettings]);
  
  const handleInterpretCanvasRequest = useCallback(async () => {
    if (!selectionRect || isInterpreting) return;

    setIsInterpreting(true);
    try {
        const snapshotDataUrl = await createCanvasSnapshot(items, selectionRect);
        const optimizedPrompt = await interpretCanvas(snapshotDataUrl, selectedItems, selectionPrompt, modelSettings.interpretation);
        setSelectionPrompt(optimizedPrompt);
    } catch (error) {
        console.error("Failed to interpret canvas:", error);
        // You could add a user-facing error notification here
    } finally {
        setIsInterpreting(false);
    }
  }, [selectionRect, isInterpreting, items, selectedItems, selectionPrompt, modelSettings.interpretation]);

  const handleGenerateFromSelectionBar = useCallback((generator: 'image' | 'video') => {
      const finalPrompt = selectionPrompt.trim() ? selectionPrompt : null;
      if (expansionGenerationInfo) {
          if (generator === 'image') {
              startExpansionGeneration(finalPrompt ?? '', expansionGenerationInfo);
          } else {
              // Video expansion is not supported in this flow.
              console.warn("Video generation is not supported for expansion.");
          }
          setExpansionGenerationInfo(null);
      } else if (selectionRect) {
          const handler = generator === 'image' ? startImageGeneration : startVideoGeneration;
          handler(finalPrompt, [...selectedItems], { ...selectionRect });
      }

      setSelectionRect(null);
      setSelectedItems([]);
  }, [selectionPrompt, selectedItems, selectionRect, startImageGeneration, startVideoGeneration, expansionGenerationInfo, startExpansionGeneration]);

  const handleDrawingOptionsChange = useCallback((newOptions: Partial<DrawingOptions>) => {
    setDrawingOptions(prev => ({...prev, ...newOptions}));
  }, []);
  
  const handleTextOptionsChange = useCallback((newOptions: Partial<TextOptions>) => {
    setTextOptions(prev => ({...prev, ...newOptions}));
    const selectedTextIds = new Set(selectedItems.filter(i => i.type === 'text').map(i => i.id));
    if (selectedTextIds.size > 0) {
        setItems(prev => prev.map(item => (item.type === 'text' && selectedTextIds.has(item.id)) ? { ...item, ...newOptions } : item));
    }
  }, [selectedItems, setItems]);

  const handleGridOptionsChange = useCallback((newOptions: Partial<GridOptions>) => {
    setGridOptions(prev => ({ ...prev, ...newOptions }));
  }, []);

  const handleSetDrawingMode = useCallback(() => {
    const newDrawingMode = !isDrawingMode;
    setIsDrawingMode(newDrawingMode);
    if (newDrawingMode) {
      setIsTextMode(false);
      setMagicFillState(s => ({ ...s, isActive: false }));
    }
  }, [isDrawingMode]);
  
  const handleSetTextMode = useCallback(() => {
    const newTextMode = !isTextMode;
    setIsTextMode(newTextMode);
    if (newTextMode) {
      setIsDrawingMode(false);
      setMagicFillState(s => ({ ...s, isActive: false }));
    }
  }, [isTextMode]);

  const handleSetMagicFillMode = useCallback(() => {
    const newMagicFillMode = !magicFillState.isActive;
    const imageItems = selectedItems.filter(i => i.type === 'image') as ImageItem[];

    const enterMagicMode = (target: ImageItem, source: ImageItem | null) => {
        setMagicFillState({ 
            isActive: true, 
            targetItemId: target.id, 
            sourceItemId: source ? source.id : null,
            maskDrawing: null 
        });
        setIsDrawingMode(false);
        setIsTextMode(false);
        setSelectionRect(null);
    };

    if (newMagicFillMode && imageItems.length === 1) {
        enterMagicMode(imageItems[0], null);
    } else if (newMagicFillMode && imageItems.length === 2) {
        const [img1, img2] = imageItems;
        const area1 = img1.width * img1.height;
        const area2 = img2.width * img2.height;
        const target = area1 >= area2 ? img1 : img2;
        const source = area1 >= area2 ? img2 : img1;
        enterMagicMode(target, source);
    } else {
        setMagicFillState({ isActive: false, targetItemId: null, sourceItemId: null, maskDrawing: null });
    }
  }, [magicFillState.isActive, selectedItems]);
  
  const exitModes = useCallback(() => {
    setIsDrawingMode(false);
    setIsTextMode(false);
    if (!magicFillState.maskDrawing) {
       setMagicFillState({ isActive: false, targetItemId: null, sourceItemId: null, maskDrawing: null });
    }
  }, [magicFillState.maskDrawing]);

  const handleAddImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) addImageToCanvas(file);
    };
    input.click();
  }, [addImageToCanvas]);

  const handleSelectionChange = useCallback((rect: SelectionRect | null, newSelectedItems: CanvasItem[]) => {
    if (imagePreview || magicFillState.isActive || expansionState.isActive) return;
    if (expansionGenerationInfo) setExpansionGenerationInfo(null);
    setSelectionRect(rect);
    setSelectedItems(newSelectedItems);
  }, [imagePreview, magicFillState.isActive, expansionState.isActive, expansionGenerationInfo]);
  
  const deleteSelectedItems = useCallback(() => {
      const selectedIds = new Set(selectedItems.map(item => item.id));
      if (selectedIds.size > 0) {
        setItems(prev => prev.filter(item => !selectedIds.has(item.id)));
        setSelectionRect(null);
        setSelectedItems([]);
      }
  }, [selectedItems, setItems]);

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    event.preventDefault();
    const clipboardItems = event.clipboardData?.items;
    if (!clipboardItems) return;

    const canvasCenterX = (window.innerWidth / 2 - pan.x) / zoom;
    const canvasCenterY = (window.innerHeight / 2 - pan.y) / zoom;
    const pastePosition = { x: canvasCenterX, y: canvasCenterY };

    for (const item of Array.from(clipboardItems)) {
        if (item.type.includes('image')) {
            const file = item.getAsFile();
            if (file) await addImageToCanvas(file, pastePosition);
        } else if (item.kind === 'string' && item.type === 'text/plain') {
            item.getAsString((text) => {
                const newText: TextItem = {
                    id: `txt_paste_${Date.now()}`, type: 'text', text,
                    x: pastePosition.x - 100, y: pastePosition.y - 50, width: 200, height: 100,
                    rotation: 0, ...textOptions
                };
                setItems(prev => [...prev, newText]);
            });
        }
    }
  }, [addImageToCanvas, textOptions, zoom, pan, setItems]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.some(type => type === 'Files' || type === 'text/html')) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);

    const canvasRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const dropPosition = {
        x: (event.clientX - canvasRect.left - pan.x) / zoom,
        y: (event.clientY - canvasRect.top - pan.y) / zoom,
    };
    
    if (event.dataTransfer.files?.length > 0) {
        await addImageToCanvas(event.dataTransfer.files[0], dropPosition);
        return;
    }
    const html = event.dataTransfer.getData('text/html');
    if (html) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const imgTag = doc.querySelector('img');
            if (imgTag?.src) {
                const response = await fetch(imgTag.src);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const blob = await response.blob();
                const file = new File([blob], imgTag.alt || 'dragged-image', { type: blob.type });
                await addImageToCanvas(file, dropPosition);
                return;
            }
        } catch (error) { console.error("Error processing dropped HTML image, falling back...", error); }
    }
    const url = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('URL');
    if (url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();
            const filename = url.substring(url.lastIndexOf('/') + 1) || 'dragged-image';
            const file = new File([blob], filename, { type: blob.type });
            await addImageToCanvas(file, dropPosition);
        } catch (error) {
            console.error("Error fetching dropped URL:", error);
            alert("Could not load the dragged image. This may be due to the source website's security policy (CORS).");
        }
    }
  }, [addImageToCanvas, zoom, pan]);
  
  const duplicateItem = useCallback((item: CanvasItem) => {
    const newItem = { ...item, id: `${item.type}_${Date.now()}` };
    const offset = 20 / zoom;
    if (newItem.type === 'drawing') {
        newItem.points = newItem.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
    } else {
        newItem.x += offset;
        newItem.y += offset;
    }
    setItems(prev => [...prev, newItem]);
    setContextMenu(null);
  }, [zoom, setItems]);
  
  const selectAllItems = useCallback(() => {
    if (items.length === 0) return;
    const boxes = items.map(getRotatedBoundingBox);
    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.width));
    const maxY = Math.max(...boxes.map(b => b.y + b.height));
    const encompassingRect: SelectionRect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    setSelectionRect(encompassingRect);
    setSelectedItems([...items]);
    setContextMenu(null);
  }, [items]);

  useEffect(() => {
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelectedItems(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); if(contextMenu?.item) duplicateItem(contextMenu.item); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAllItems(); }
      }
      window.addEventListener('keydown', handleGlobalKeyDown);
      window.addEventListener('paste', handlePaste);
      return () => {
          window.removeEventListener('keydown', handleGlobalKeyDown);
          window.removeEventListener('paste', handlePaste);
      };
  }, [deleteSelectedItems, handlePaste, undo, redo, contextMenu, duplicateItem, selectAllItems, handleSave]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const delta = -e.deltaY * zoomSpeed * 0.05;
    const newZoom = zoom + delta;
    const clampedZoom = Math.max(0.1, Math.min(newZoom, 5));
    const canvasRect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const mouseY = e.clientY - canvasRect.top;
    const newPanX = mouseX - (mouseX - pan.x) * (clampedZoom / zoom);
    const newPanY = mouseY - (mouseY - pan.y) * (clampedZoom / zoom);
    setZoom(clampedZoom);
    setPan({ x: newPanX, y: newPanY });
  };
  
  const handleAcceptPreview = useCallback(() => {
    if (!imagePreview) return;
    const itemsToReplaceIds = new Set(imagePreview.itemsToReplace.map(i => i.id));
    setItems(prev => [...prev.filter(item => !itemsToReplaceIds.has(item.id)), imagePreview.newImage]);
    setImagePreview(null);
  }, [imagePreview, setItems]);

  const handleKeepBoth = useCallback(() => {
    if (!imagePreview) return;
    setItems(prev => [...prev, imagePreview.newImage]);
    setImagePreview(null);
  }, [imagePreview, setItems]);

  const handleDiscardPreview = useCallback(() => {
    if (!imagePreview) return;
    // No change to items, just clear the preview.
    setImagePreview(null);
  }, [imagePreview]);
  
  const handleShowContextMenu = useCallback((data: ContextMenuData) => setContextMenu(data), []);

  const handleGenerateFromContextMenu = useCallback(() => {
    if (!isApiKeyConfigured || !contextMenu || contextMenu.item) return;
    setGenerationPromptModal({ isOpen: true, position: contextMenu.canvasPoint });
    setContextMenu(null);
  }, [contextMenu, isApiKeyConfigured]);
  
  const handleGenerateFromModal = (prompt: string, model: string) => {
    if (!generationPromptModal.position) return;
    const generationSize = 512;
    const rect = {
        x: generationPromptModal.position.x - generationSize / 2,
        y: generationPromptModal.position.y - generationSize / 2,
        width: generationSize, height: generationSize,
    };
    startImageGeneration(prompt, [], rect, model);
    setGenerationPromptModal({ isOpen: false, position: null });
  };

  const bringToFront = () => {
    if (!contextMenu?.item) return;
    setItems(prev => [...prev.filter(i => i.id !== contextMenu.item!.id), contextMenu.item!]);
    setContextMenu(null);
  };

  const sendToBack = () => {
    if (!contextMenu?.item) return;
    setItems(prev => [contextMenu.item!, ...prev.filter(i => i.id !== contextMenu.item!.id)]);
    setContextMenu(null);
  };
  
  const deleteContextItem = () => {
      if (!contextMenu?.item) return;
      setItems(prev => prev.filter(i => i.id !== contextMenu.item!.id));
      setContextMenu(null);
  }

  const handleStartExpansionMode = () => {
    if (!contextMenu?.item || contextMenu.item.type !== 'image') return;
    setSelectionRect(null);
    setSelectedItems([]);
    setExpansionState({ isActive: true, targetItem: contextMenu.item });
    setContextMenu(null);
  };
  
  const handleExpansionAreaDefined = useCallback((rect: SelectionRect, direction: Handle) => {
    if (!expansionState.targetItem) return;
    setExpansionGenerationInfo({
        targetItem: expansionState.targetItem,
        rect: rect,
        direction: direction,
    });
    setSelectionRect(rect);
    setSelectedItems([expansionState.targetItem]);
    setExpansionState({ isActive: false, targetItem: null });
  }, [expansionState.targetItem]);

  const handleDownloadImage = useCallback(() => {
    if (!contextMenu?.item || contextMenu.item.type !== 'image') return;
    
    const imageItem = contextMenu.item as ImageItem;
    const link = document.createElement('a');
    link.href = imageItem.src;
    
    const sanitizedPrompt = imageItem.prompt.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${sanitizedPrompt.substring(0, 30) || 'canvas-image'}.png`;

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setContextMenu(null);
  }, [contextMenu]);
  
  const textItemsSelected = selectedItems.length > 0 && selectedItems.every(item => item.type === 'text');
  const showTextToolbar = isTextMode || textItemsSelected;
  const singleSelectedTextItem = selectedItems.length === 1 && selectedItems[0].type === 'text' ? selectedItems[0] as TextItem : null;
  
  const magicFillMode: MagicFillMode = (() => {
    const imageItems = selectedItems.filter(i => i.type === 'image');
    if (imageItems.length === 1) return 'fill';
    if (imageItems.length === 2) return 'replace';
    return 'disabled';
  })();

  const magicFillTargetItem = magicFillState.targetItemId ? items.find(i => i.id === magicFillState.targetItemId) as ImageItem : null;
  const magicFillSourceItem = magicFillState.sourceItemId ? items.find(i => i.id === magicFillState.sourceItemId) as ImageItem : null;

  const activeGenerationTasks = generationTasks.filter(t => t.status === 'interpreting' || t.status === 'generating');

  return (
    <div 
      className="w-screen h-screen bg-gray-900 text-white overflow-hidden font-sans relative"
      onDragEnter={handleDragEnter} onDragLeave={handleDragLeave}
      onDragOver={handleDragOver} onDrop={handleDrop} onWheel={handleWheel}
    >
      <Canvas 
        items={items} 
        setItems={setItems} 
        isDrawingMode={isDrawingMode}
        isTextMode={isTextMode} 
        drawingOptions={drawingOptions} 
        textOptions={textOptions}
        selectionRect={selectionRect} 
        onSelectionChange={handleSelectionChange}
        onModeChange={exitModes} 
        zoom={zoom} 
        pan={pan} 
        setPan={setPan}
        onShowContextMenu={handleShowContextMenu}
        previewItem={imagePreview?.newImage}
        ghostedItemIds={imagePreview ? imagePreview.itemsToReplace.map(i => i.id) : []}
        magicFillState={magicFillState}
        onMaskUpdate={(mask) => setMagicFillState(s => ({...s, maskDrawing: mask}))}
        expansionState={expansionState}
        onExpansionAreaDefined={handleExpansionAreaDefined}
        gridOptions={gridOptions}
        onInteractionEnd={() => {}}
      />
      <Toolbar
        onAddImage={handleAddImage} onSetDrawingMode={handleSetDrawingMode}
        isDrawingMode={isDrawingMode} drawingOptions={drawingOptions} onDrawingOptionsChange={handleDrawingOptionsChange}
        onSetTextMode={handleSetTextMode} isTextMode={isTextMode}
        textOptions={singleSelectedTextItem ? { color: singleSelectedTextItem.color, fontSize: singleSelectedTextItem.fontSize } : textOptions}
        onTextOptionsChange={handleTextOptionsChange} showTextToolbar={showTextToolbar}
        onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
        onSetMagicFillMode={handleSetMagicFillMode} isMagicFillMode={magicFillState.isActive}
        magicFillMode={magicFillMode}
        gridOptions={gridOptions} onGridOptionsChange={handleGridOptionsChange}
      />
      {selectionRect && !isDrawingMode && !isTextMode && !imagePreview && (
        <SelectionPromptBar
            selectionRect={selectionRect}
            prompt={selectionPrompt}
            onPromptChange={setSelectionPrompt}
            onGenerate={handleGenerateFromSelectionBar}
            onInterpret={handleInterpretCanvasRequest}
            onDelete={deleteSelectedItems}
            itemCount={selectedItems.length}
            zoom={zoom} pan={pan}
            disabled={!isApiKeyConfigured}
            isInterpreting={isInterpreting}
        />
      )}
      {magicFillState.isActive && magicFillState.maskDrawing && magicFillTargetItem && (
        <MagicFillPrompt
            targetItem={magicFillTargetItem}
            sourceItem={magicFillSourceItem}
            onSubmit={startMagicFillGeneration}
            onCancel={() => setMagicFillState({ isActive: false, targetItemId: null, sourceItemId: null, maskDrawing: null })}
            zoom={zoom} pan={pan}
        />
      )}
       {activeGenerationTasks.map(task => (
        <div
            key={task.id}
            className="absolute z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm rounded-lg pointer-events-none transition-opacity duration-300 overflow-hidden"
            style={{
                left: task.selectionRect.x * zoom + pan.x,
                top: task.selectionRect.y * zoom + pan.y,
                width: task.selectionRect.width * zoom,
                height: task.selectionRect.height * zoom,
            }}
        >
            <div className="absolute inset-0 bg-indigo-500/10 animate-pulse shimmer-effect"></div>
            <LoadingSpinner className="w-10 h-10 text-indigo-400" />
            <p className="mt-4 text-white text-lg font-semibold tracking-wide">
                {task.type === 'video' ? 'Creating Video...' : 'Fusing Ideas...'}
            </p>
            <p className="text-gray-300 text-sm">AI is thinking</p>
        </div>
      ))}
      {imagePreview && (
        <ReplacementConfirmation
            preview={imagePreview} onAccept={handleAcceptPreview}
            onKeepBoth={handleKeepBoth} onDiscard={handleDiscardPreview}
            zoom={zoom} pan={pan}
        />
      )}
       {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}
          onBringToFront={bringToFront} onSendToBack={sendToBack}
          onDuplicate={() => duplicateItem(contextMenu.item!)} onDelete={deleteContextItem}
          onGenerateImage={handleGenerateFromContextMenu}
          onExpand={handleStartExpansionMode}
          onDownload={handleDownloadImage}
          itemType={contextMenu.item?.type}
          isGenerationDisabled={!isApiKeyConfigured}
        />
      )}
       <PromptModal
        isOpen={generationPromptModal.isOpen}
        onClose={() => setGenerationPromptModal({ isOpen: false, position: null })}
        onSubmit={handleGenerateFromModal}
        availableModels={AVAILABLE_MODELS.textToImage}
        defaultModel={modelSettings.textToImage}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={modelSettings}
        onSettingsChange={setModelSettings}
      />
      <ProgressPanel 
          tasks={generationTasks} isOpen={isPanelOpen}
          onToggle={() => setIsPanelOpen(!isPanelOpen)}
          onShowSettings={() => setIsSettingsModalOpen(true)}
          onSave={handleSave}
          hasUnsavedChanges={hasUnsavedChanges}
      />
      {!isApiKeyConfigured && <ApiKeyWarningBanner />}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none z-50 transition-opacity duration-300">
          <div className="text-center p-10 border-4 border-dashed border-gray-400 rounded-3xl bg-gray-800/20">
            <p className="text-4xl font-bold text-white tracking-wider">Drop Image Here</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;