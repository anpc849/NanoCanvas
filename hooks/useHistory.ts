import { useState, useCallback } from 'react';

/**
 * A custom hook for managing state with undo/redo functionality.
 * This implementation is designed to be robust against race conditions
 * by using a single state object and functional updates, ensuring that
 * rapid state changes (like during a drag operation that's interrupted
 * by another state update) are handled correctly.
 * @param initialState The initial state value.
 * @param onStateChange A callback that fires synchronously whenever the state changes.
 */
export const useHistory = <T>(initialState: T, onStateChange?: () => void) => {
    // Combine history and index into a single state object to ensure atomic updates.
    const [state, setStateInternal] = useState({
        history: [initialState],
        index: 0,
    });
    const { history, index } = state;

    /**
     * Updates the state. This function is stable and can be used in dependency arrays.
     * @param action The new state or a function that returns the new state.
     * @param options.commit If true (default), creates a new history entry. If false, modifies the current entry.
     */
    const setState = useCallback((action: T | ((prevState: T) => T), options?: { commit?: boolean }) => {
        const commit = options?.commit ?? true;

        // Use the functional update form of useState to avoid stale state issues.
        setStateInternal(currentState => {
            const currentHistoryState = currentState.history[currentState.index];
            const newState = typeof action === 'function' ? (action as (prevState: T) => T)(currentHistoryState) : action;
            
            // Prevent updates if state is identical to avoid unnecessary re-renders and history entries.
            if (JSON.stringify(newState) === JSON.stringify(currentHistoryState)) {
                return currentState;
            }

            // Fire the callback with the new state before updating our internal state.
            if (onStateChange) {
                onStateChange();
            }

            if (commit) {
                // Add a new state to the history, trimming any 'redo' states.
                const newHistory = currentState.history.slice(0, currentState.index + 1);
                newHistory.push(newState);
                return {
                    history: newHistory,
                    index: newHistory.length - 1
                };
            } else {
                // Modify the current state in history for transient updates (e.g., dragging).
                const newHistory = [...currentState.history];
                newHistory[currentState.index] = newState;
                return {
                    history: newHistory,
                    index: currentState.index
                };
            }
        });
    }, [onStateChange]);

    const undo = useCallback(() => {
        setStateInternal(currentState => {
            if (currentState.index > 0) {
                const newIndex = currentState.index - 1;
                if (onStateChange) {
                    onStateChange();
                }
                return { ...currentState, index: newIndex };
            }
            return currentState;
        });
    }, [onStateChange]);

    const redo = useCallback(() => {
        setStateInternal(currentState => {
            if (currentState.index < currentState.history.length - 1) {
                const newIndex = currentState.index + 1;
                if (onStateChange) {
                    onStateChange();
                }
                return { ...currentState, index: newIndex };
            }
            return currentState;
        });
    }, [onStateChange]);

    return {
        state: history[index],
        setState,
        undo,
        redo,
        canUndo: index > 0,
        canRedo: index < history.length - 1,
    };
};