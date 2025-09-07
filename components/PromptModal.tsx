
import React, { useState, useEffect, useRef } from 'react';
import { MagicWandIcon, SendIcon } from './icons';

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string, model: string) => void;
  availableModels: string[];
  defaultModel: string;
}

const PromptModal: React.FC<PromptModalProps> = ({ isOpen, onClose, onSubmit, availableModels, defaultModel }) => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setPrompt(''); // Reset prompt on open
      setSelectedModel(defaultModel); // Reset model to default
    }
  }, [isOpen, defaultModel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onSubmit(prompt.trim(), selectedModel);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-lg p-6 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center mb-4">
          <MagicWandIcon className="w-6 h-6 text-indigo-400 mr-3" />
          <h2 className="text-xl font-bold text-white">Generate a New Image</h2>
        </div>
        <p className="text-gray-400 mb-6">Describe the image you want to create. Be as specific as you can for the best results.</p>
        <form onSubmit={handleSubmit}>
          <div className="relative mb-4">
            <label htmlFor="prompt-input" className="sr-only">Image Prompt</label>
            <input
              id="prompt-input"
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., A futuristic city skyline at sunset, cyberpunk style"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-grow">
              <label htmlFor="model-select" className="text-sm text-gray-400 mr-2">Model:</label>
              <select 
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-md text-white text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {availableModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!prompt.trim()}
              aria-label="Generate Image"
              className="p-3 rounded-lg flex items-center justify-center transition-all duration-200 bg-green-600 text-white hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              <SendIcon className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PromptModal;
