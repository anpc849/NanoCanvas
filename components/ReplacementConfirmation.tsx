import React from 'react';
import { ImagePreview, Point } from '../types';
import { CheckIcon, TrashIcon, PlusIcon } from './icons';

interface ReplacementConfirmationProps {
  preview: ImagePreview;
  onAccept: () => void;
  onKeepBoth: () => void;
  onDiscard: () => void;
  zoom: number;
  pan: Point;
}

const ReplacementConfirmation: React.FC<ReplacementConfirmationProps> = ({
  preview,
  onAccept,
  onKeepBoth,
  onDiscard,
  zoom,
  pan,
}) => {
  const { newImage } = preview;

  const screenX = (newImage.x + newImage.width / 2) * zoom + pan.x;
  const screenY = (newImage.y + newImage.height) * zoom + pan.y;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${screenX}px`,
    top: `${screenY + 10}px`,
    transform: 'translateX(-50%)',
    zIndex: 25,
  };

  const handleButtonClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  }

  return (
    <div
      style={style}
      className="bg-gray-800/70 backdrop-blur-md rounded-lg shadow-2xl p-2 flex items-center space-x-3 border border-gray-700 animate-fade-in-up"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="text-sm font-medium text-gray-200 mr-2">Generated Image:</p>
      <div className="flex space-x-2">
        <button
          onClick={(e) => handleButtonClick(e, onAccept)}
          title="Keep this image and remove the originals"
          className="px-3 py-1.5 text-sm font-semibold text-white bg-green-600 rounded-md hover:bg-green-500 transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500"
        >
          <CheckIcon className="w-4 h-4 mr-1" /> Accept & Replace
        </button>
         <button
          onClick={(e) => handleButtonClick(e, onKeepBoth)}
          title="Keep both the new and original items"
          className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-500 transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
        >
          <PlusIcon className="w-4 h-4 mr-1" /> Keep Both
        </button>
        <button
          onClick={(e) => handleButtonClick(e, onDiscard)}
          title="Discard this image and keep the originals"
          className="px-3 py-1.5 text-sm font-semibold text-gray-200 bg-red-600 rounded-md hover:bg-red-500 transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-red-500"
        >
          <TrashIcon className="w-4 h-4 mr-1" /> Discard
        </button>
      </div>
    </div>
  );
};

export default ReplacementConfirmation;
