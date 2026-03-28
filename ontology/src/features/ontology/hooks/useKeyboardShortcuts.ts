'use client';

import { useEffect, useState, useCallback } from 'react';
import { useOntologyStore, useTemporalStore } from './useOntologyStore';

export function useKeyboardShortcuts() {
  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const openPopover = useOntologyStore((s) => s.openPopover);
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
      const mod = e.ctrlKey || e.metaKey;

      // Delete key — only when not typing in an input
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        if (selectedNodeId) {
          e.preventDefault();
          setShowDeleteDialog(true);
        }
      }

      // Ctrl+Z / Cmd+Z — Undo
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z — Redo
      if (mod && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }

      // Ctrl+Y / Cmd+Y — Redo (alternative)
      if (mod && e.key === 'y') {
        e.preventDefault();
        redo();
      }

      // Ctrl+N — New node (quick create)
      if (mod && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        openPopover({
          type: 'newNode',
          position: { x: window.innerWidth / 2, y: 200 },
        });
      }

      // Ctrl+S / Cmd+S — Save (commit)
      if (mod && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        const commitBtn = document.querySelector('[data-testid="commit-button"]') as HTMLButtonElement;
        if (commitBtn) {
          commitBtn.click();
        }
      }

      // Ctrl+Enter / Cmd+Enter — Push to Neo4j
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        const pushBtn = document.querySelector('[data-testid="push-button"]') as HTMLButtonElement;
        if (pushBtn) {
          pushBtn.click();
        }
      }

      // Ctrl+Shift+F / Cmd+Shift+F — Canvas search (open command palette with focus)
      if (mod && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        // Dispatch Ctrl+K to open command palette (handled by CommandPalette)
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'k',
            ctrlKey: true,
            bubbles: true,
          }),
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, undo, redo, openPopover]);

  return {
    showDeleteDialog,
    requestDelete,
    confirmDelete,
    cancelDelete,
  };
}
