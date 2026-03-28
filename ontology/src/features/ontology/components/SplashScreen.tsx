'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  /** Minimum display time in ms before allowing fade-out */
  minDisplayMs?: number;
  /** Called after the fade-out animation completes */
  onComplete?: () => void;
}

export default function SplashScreen({
  minDisplayMs = 1800,
  onComplete,
}: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / minDisplayMs, 1);
      setProgress(pct);
      if (pct >= 1) {
        clearInterval(interval);
        setVisible(false);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [minDisplayMs]);

  const handleExitComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
        >
          <div className="flex flex-col items-center gap-5">
            {/* Logo mark with ping glow */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 12, stiffness: 200 }}
              className="relative"
            >
              <div
                className="absolute inset-0 rounded-2xl gradient-brand-subtle animate-ping"
                style={{ animationDuration: '2s' }}
              />
              <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center shadow-lg">
                {/* Inline SVG logo for independence from file loading */}
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 28 28"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <line
                    x1="14" y1="5.5" x2="5.5" y2="21"
                    stroke="white" strokeWidth="2" strokeLinecap="round"
                  />
                  <line
                    x1="14" y1="5.5" x2="22.5" y2="21"
                    stroke="white" strokeWidth="2" strokeLinecap="round"
                  />
                  <line
                    x1="5.5" y1="21" x2="22.5" y2="21"
                    stroke="white" strokeWidth="2" strokeLinecap="round"
                  />
                  <circle cx="14" cy="5.5" r="3.5" fill="white" />
                  <circle cx="5.5" cy="21" r="4" fill="white" />
                  <circle cx="22.5" cy="21" r="3.5" fill="white" />
                </svg>
              </div>
            </motion.div>

            {/* Brand text */}
            <div className="text-center">
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="text-display-lg font-bold gradient-brand-text"
              >
                Ontology Studio
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="text-caption text-muted-foreground mt-1.5"
              >
                Loading workspace...
              </motion.p>
            </div>

            {/* Progress bar */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0.8 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="w-36 h-0.5 bg-muted rounded-full overflow-hidden"
            >
              <div
                className="h-full gradient-brand rounded-full transition-all duration-75 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
