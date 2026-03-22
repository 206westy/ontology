'use client';

import { useEffect, useState, useCallback } from 'react';
import { useOntologyStore, useTemporalStore } from './useOntologyStore';

export function useKeyboardShortcuts() {
  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);

  const requestDelete = useCallback(() => {
    if (selectedNodeId) {
      setShowDeleteDialog(true);
    }
  }, [selectedNodeId]);

  const confirmDelete = useCallback(() => {
    useOntologyStore.getState().deleteSelectedNode();
    setShowDeleteDialog(false);
  }, []);

  const cancelDelete = useCallback(() => {
    setShowDeleteDialog(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      // Delete key — only when not typing in an input
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        if (selectedNodeId) {
          e.preventDefault();
          setShowDeleteDialog(true);
        }
      }

      // Ctrl+Z / Cmd+Z — Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z — Redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }

      // Ctrl+Y / Cmd+Y — Redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, undo, redo]);

  return {
    showDeleteDialog,
    requestDelete,
    confirmDelete,
    cancelDelete,
  };
}
