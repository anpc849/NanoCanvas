import React, { useState, useEffect } from 'react';
import { ImageItem, Point } from '../types';
import { SendIcon } from './icons';

interface MagicFillPromptProps {
  targetItem: ImageItem;
  sourceItem: ImageItem | null;
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  zoom: number;
  pan: Point;
}

const MagicFillPrompt: React.FC<MagicFillPromptProps> = ({ targetItem, sourceItem, onSubmit, onCancel, zoom, pan }) => {
  const [prompt, setPrompt] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const barWidth = Math.max(250, Math.min(400, targetItem.width * zoom));
    
    // Calculate position in screen space
    const screenRectTop = targetItem.y * zoom + pan.y;
    const screenRectLeft = targetItem.x * zoom + pan.x;
    const screenRectWidth = targetItem.width * zoom;
    
    const left = screenRectLeft + screenRectWidth / 2 - barWidth / 2;
    const top = screenRectTop + (targetItem.height * zoom) + 10;
    
    const PADDING = 10;
    const boundedLeft = Math.max(PADDING, Math.min(left, window.innerWidth - barWidth - PADDING));

    setPosition({ top, left: boundedLeft, width: barWidth });
  }, [targetItem, zoom, pan]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(prompt);
  };

  const placeholderText = sourceItem ? "Optional: Guide the replacement..." : "Describe the change...";

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute z-20 bg-gray-800/70 backdrop-blur-md rounded-xl shadow-2xl p-2 flex items-center border border-gray-700 animate-fade-in-up"
      style={{ top: position.top, left: position.left, width: position.width }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {sourceItem && (
        <div className="flex items-center mr-2 pl-1" title={`Source: ${sourceItem.prompt}`}>
            <img src={sourceItem.src} alt={sourceItem.prompt} className="w-6 h-6 rounded-sm object-cover border border-gray-600" />
        </div>
      )}
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholderText}
        className="flex-grow bg-transparent text-white placeholder-gray-400 focus:outline-none px-2 text-sm"
        autoFocus
        onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        type="submit"
        title="Generate"
        className="p-2 rounded-lg flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 bg-indigo-600 text-white hover:bg-indigo-500 focus:ring-indigo-500 disabled:bg-gray-600 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <SendIcon className="w-4 h-4" />
      </button>
    </form>
  );
};

export default MagicFillPrompt;