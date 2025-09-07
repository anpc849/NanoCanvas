import React from 'react';
import { ImageIcon, PencilIcon, TypeTextIcon, UndoIcon, RedoIcon, MagicWandIcon, GridIcon } from './icons';
import { DrawingOptions, GridOptions, TextOptions } from '../types';

export type MagicFillMode = 'disabled' | 'fill' | 'replace';

interface ToolbarProps {
  onAddImage: () => void;
  onSetDrawingMode: () => void;
  isDrawingMode: boolean;
  drawingOptions: DrawingOptions;
  onDrawingOptionsChange: (newOptions: Partial<DrawingOptions>) => void;
  onSetTextMode: () => void;
  isTextMode: boolean;
  textOptions: TextOptions;
  onTextOptionsChange: (newOptions: Partial<TextOptions>) => void;
  showTextToolbar: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSetMagicFillMode: () => void;
  isMagicFillMode: boolean;
  magicFillMode: MagicFillMode;
  gridOptions: GridOptions;
  onGridOptionsChange: (newOptions: Partial<GridOptions>) => void;
}

const COLORS = ['#FFFFFF', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6'];
const STROKE_WIDTHS = [2, 5, 10];
const GRID_COLORS = ['rgba(255, 255, 255, 0.2)', 'rgba(239, 68, 68, 0.4)', 'rgba(59, 130, 246, 0.4)'];


const DrawingControls: React.FC<{ options: DrawingOptions, onChange: (o: Partial<DrawingOptions>) => void }> = ({ options, onChange }) => (
    <>
        <div className="h-8 w-px bg-gray-600 mx-2"></div>
        <div className="flex items-center space-x-2">
            {COLORS.map(color => (
                <button
                    key={color}
                    onClick={() => onChange({ color })}
                    className={`w-6 h-6 rounded-full transition-transform duration-150 border-2 ${options.color === color ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    title={color}
                />
            ))}
        </div>
        <div className="h-8 w-px bg-gray-600 mx-2"></div>
        <div className="flex items-center space-x-2">
            {STROKE_WIDTHS.map(width => (
                <button
                    key={width}
                    onClick={() => onChange({ strokeWidth: width })}
                    className={`p-1 rounded-md transition-colors duration-150 ${options.strokeWidth === width ? 'bg-indigo-500' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                >
                    <div className="bg-white rounded-full" style={{ width: width + 2, height: width + 2 }}></div>
                </button>
            ))}
        </div>
    </>
);

const TextControls: React.FC<{ options: TextOptions, onChange: (o: Partial<TextOptions>) => void }> = ({ options, onChange }) => (
     <>
        <div className="h-8 w-px bg-gray-600 mx-2"></div>
        <div className="flex items-center space-x-2">
            {COLORS.map(color => (
                <button
                    key={color}
                    onClick={() => onChange({ color })}
                    className={`w-6 h-6 rounded-full transition-transform duration-150 border-2 ${options.color === color ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    title={color}
                />
            ))}
        </div>
        <div className="h-8 w-px bg-gray-600 mx-2"></div>
        <div className="flex items-center space-x-2">
             <span className="text-xs text-gray-400">Size:</span>
             <input
                type="range"
                min="12"
                max="72"
                step="1"
                value={options.fontSize}
                onChange={(e) => onChange({ fontSize: parseInt(e.target.value, 10) })}
                className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
        </div>
    </>
);

const GridControls: React.FC<{ options: GridOptions, onChange: (o: Partial<GridOptions>) => void }> = ({ options, onChange }) => (
    <>
        <div className="h-8 w-px bg-gray-600 mx-2"></div>
        <div className="flex items-center space-x-2">
            {GRID_COLORS.map(color => (
                <button
                    key={color}
                    onClick={() => onChange({ color })}
                    className={`w-6 h-6 rounded-full transition-transform duration-150 border-2 ${options.color === color ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    title={color}
                />
            ))}
        </div>
        <div className="h-8 w-px bg-gray-600 mx-2"></div>
        <div className="flex items-center space-x-2">
             <span className="text-xs text-gray-400">Spacing:</span>
             <input
                type="range"
                min="20"
                max="200"
                step="10"
                value={options.spacing}
                onChange={(e) => onChange({ spacing: parseInt(e.target.value, 10) })}
                className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
        </div>
    </>
);


const Toolbar: React.FC<ToolbarProps> = ({
  onAddImage,
  onSetDrawingMode, isDrawingMode, drawingOptions, onDrawingOptionsChange,
  onSetTextMode, isTextMode, textOptions, onTextOptionsChange, showTextToolbar,
  onUndo, onRedo, canUndo, canRedo,
  onSetMagicFillMode, isMagicFillMode, magicFillMode,
  gridOptions, onGridOptionsChange
}) => {
  const baseButtonClass = "p-3 rounded-lg flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900";
  const iconClass = "w-6 h-6";
  
  const getMagicFillTitle = () => {
    switch(magicFillMode) {
      case 'fill': return 'Magic Fill (Inpaint with text)';
      case 'replace': return 'Magic Replace (Inpaint with image)';
      case 'disabled':
      default:
        return 'Select 1 image for Magic Fill or 2 for Magic Replace';
    }
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-800/50 backdrop-blur-md rounded-xl shadow-2xl p-2 flex items-center space-x-2 border border-gray-700 z-20">
      {/* Undo/Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className={`${baseButtonClass} text-gray-300 hover:bg-indigo-500 hover:text-white focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
      >
        <UndoIcon className="w-5 h-5" />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        className={`${baseButtonClass} text-gray-300 hover:bg-indigo-500 hover:text-white focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
      >
        <RedoIcon className="w-5 h-5" />
      </button>

      <div className="h-8 w-px bg-gray-600 mx-2"></div>

      {/* Main Tools */}
      <button 
        onClick={onAddImage} 
        title="Upload Image"
        className={`${baseButtonClass} text-gray-300 hover:bg-indigo-500 hover:text-white focus:ring-indigo-500`}
      >
        <ImageIcon className={iconClass} />
      </button>
       <button 
        onClick={onSetTextMode} 
        title="Add Text"
        className={`${baseButtonClass} ${isTextMode ? 'bg-indigo-600 text-white' : 'text-gray-300'} hover:bg-indigo-500 hover:text-white focus:ring-indigo-500`}
      >
        <TypeTextIcon className={iconClass} />
      </button>
      <button 
        onClick={onSetDrawingMode} 
        title="Draw Freely"
        className={`${baseButtonClass} ${isDrawingMode ? 'bg-indigo-600 text-white' : 'text-gray-300'} hover:bg-indigo-500 hover:text-white focus:ring-indigo-500`}
      >
        <PencilIcon className={iconClass} />
      </button>
      <button 
        onClick={onSetMagicFillMode} 
        disabled={magicFillMode === 'disabled'}
        title={getMagicFillTitle()}
        className={`${baseButtonClass} ${isMagicFillMode ? 'bg-indigo-600 text-white' : 'text-gray-300'} hover:bg-indigo-500 hover:text-white focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
      >
        <MagicWandIcon className={iconClass} />
      </button>
      
      <div className="h-8 w-px bg-gray-600 mx-2"></div>

      <button
        onClick={() => onGridOptionsChange({ isVisible: !gridOptions.isVisible })}
        title="Toggle Grid & Snapping"
        className={`${baseButtonClass} ${gridOptions.isVisible ? 'bg-indigo-600 text-white' : 'text-gray-300'} hover:bg-indigo-500 hover:text-white focus:ring-indigo-500`}
      >
        <GridIcon className="w-5 h-5" />
      </button>

      {/* Contextual Controls */}
      {isDrawingMode && <DrawingControls options={drawingOptions} onChange={onDrawingOptionsChange} />}
      {showTextToolbar && <TextControls options={textOptions} onChange={onTextOptionsChange} />}
      {gridOptions.isVisible && <GridControls options={gridOptions} onChange={onGridOptionsChange} />}
    </div>
  );
};

export default Toolbar;
