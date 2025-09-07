
import React from 'react';
import { GenerationTask } from '../types';
import { LoadingSpinner, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, GenerateIcon, SettingsIcon, SaveIcon } from './icons';

interface ProgressPanelProps {
  tasks: GenerationTask[];
  isOpen: boolean;
  onToggle: () => void;
  onShowSettings: () => void;
  onSave: () => void;
  hasUnsavedChanges: boolean;
}

const getTaskTitle = (task: GenerationTask) => {
    const taskId = task.id.split('_')[1];
    switch (task.type) {
        case 'magic-fill':
            return `Magic Fill Task #${taskId}`;
        case 'video':
            return `Video Task #${taskId}`;
        case 'standard':
        default:
            return `Fusion Task #${taskId}`;
    }
}

const TaskLog: React.FC<{ task: GenerationTask }> = ({ task }) => (
    <div className="bg-gray-800/50 rounded-lg p-3 mb-3 border border-gray-700">
        <div className="flex items-center mb-2">
            {task.status === 'generating' || task.status === 'interpreting' ? (
                <LoadingSpinner className="w-5 h-5 mr-2 text-indigo-400" />
            ) : (
                <GenerateIcon className={`w-5 h-5 mr-2 ${task.status === 'error' ? 'text-red-500' : 'text-green-500'}`} />
            )}
            <h3 className="font-bold text-md text-gray-200">{getTaskTitle(task)}</h3>
        </div>
        <div className="space-y-1.5 text-sm">
            {task.log.map((entry, index) => (
                <div key={index} className="text-gray-400">
                    {entry.type === 'prompt' && <p className="p-2 bg-gray-700/50 rounded-md text-gray-300 whitespace-pre-wrap font-mono text-xs">
                        {entry.message}
                    </p>}
                    {entry.type === 'status' && <p className="italic">{entry.message}</p>}
                    {entry.type === 'result' && <p className={`font-semibold ${task.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                       &raquo; {entry.message}
                    </p>}
                </div>
            ))}
        </div>
    </div>
);

const ProgressPanel: React.FC<ProgressPanelProps> = ({ tasks, isOpen, onToggle, onShowSettings, onSave, hasUnsavedChanges }) => {
    return (
        <>
            <button
                onClick={onToggle}
                title={isOpen ? "Close Panel" : "Open Panel"}
                className="absolute top-1/2 -translate-y-1/2 z-30 bg-gray-800/80 backdrop-blur-md p-2 rounded-l-lg border border-r-0 border-gray-700 transition-transform hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ right: isOpen ? '350px' : '0px' }}
            >
                {isOpen ? <ChevronDoubleRightIcon className="w-5 h-5" /> : <ChevronDoubleLeftIcon className="w-5 h-5" />}
            </button>
            <div
                className="absolute top-0 right-0 h-full bg-gray-900/80 backdrop-blur-xl border-l border-gray-700 shadow-2xl z-20 transition-transform duration-300 ease-in-out"
                style={{
                    width: '350px',
                    transform: isOpen ? 'translateX(0%)' : 'translateX(100%)',
                }}
            >
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between p-4 border-b border-gray-700">
                        <h2 className="text-lg font-semibold">
                            Generation Progress
                        </h2>
                        <div className="flex items-center space-x-1">
                            <button
                                onClick={onSave}
                                title={hasUnsavedChanges ? "Save changes (Ctrl+S)" : "All changes saved"}
                                className={`p-2 rounded-lg transition-colors duration-200 ${
                                hasUnsavedChanges
                                    ? 'text-indigo-400 hover:bg-gray-700 hover:text-white'
                                    : 'text-gray-500 hover:bg-gray-700 hover:text-white'
                                }`}
                            >
                                <SaveIcon className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={onShowSettings} 
                                title="Model Settings"
                                className="p-2 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                            >
                                <SettingsIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-grow p-4 overflow-y-auto">
                        {tasks.length === 0 ? (
                            <div className="text-center text-gray-500 mt-8">
                                <p>No generation tasks yet.</p>
                                <p className="text-sm">Select an area and write a prompt to start.</p>
                            </div>
                        ) : (
                            tasks.map(task => (
                                <TaskLog key={task.id} task={task} />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProgressPanel;