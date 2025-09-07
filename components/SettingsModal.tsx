
import React from 'react';
import { ModelSettings, AVAILABLE_MODELS } from '../types';
import { SettingsIcon } from './icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ModelSettings;
  onSettingsChange: (newSettings: ModelSettings) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSettingsChange }) => {
  if (!isOpen) return null;

  const handleSettingChange = (key: keyof ModelSettings, value: string) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const settingCategories: { key: keyof ModelSettings, label: string, description: string }[] = [
    { key: 'textToImage', label: 'Text-to-Image Generation', description: 'Model for creating images from a text prompt only.' },
    { key: 'canvasToImage', label: 'Canvas-to-Image Fusion', description: 'Model for combining multiple items on the canvas into one image.' },
    { key: 'video', label: 'Video Generation', description: 'Model for animating a canvas selection into a video.' },
    { key: 'interpretation', label: 'Canvas Interpretation', description: 'Model for understanding the layout and intent of canvas items.' },
  ];

  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-xl p-6 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center mb-4">
          <SettingsIcon className="w-6 h-6 text-indigo-400 mr-3" />
          <h2 className="text-xl font-bold text-white">Model Settings</h2>
        </div>
        <p className="text-gray-400 mb-6">Choose the default AI models for different generation tasks. You can override some of these settings during generation.</p>
        
        <div className="space-y-6">
          {settingCategories.map(({ key, label, description }) => (
            <div key={key}>
              <label htmlFor={`${key}-select`} className="block text-md font-medium text-gray-200">{label}</label>
              <p className="text-sm text-gray-500 mb-2">{description}</p>
              <select 
                id={`${key}-select`}
                value={settings[key]}
                onChange={(e) => handleSettingChange(key, e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {AVAILABLE_MODELS[key].map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-8 text-right">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
