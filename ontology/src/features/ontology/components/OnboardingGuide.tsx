'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight, MousePointerClick, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { overlay } from '@/lib/motion-presets';

const STORAGE_KEY = 'onboarding_completed';

interface Step {
  title: string;
  description: string;
  icon: React.ReactNode;
  highlightArea: { top: string; left: string; width: string; height: string };
}

const steps: Step[] = [
  {
    title: '텍스트를 입력하거나 더블클릭하세요',
    description:
      '빈 캔버스에서 자유 형식의 텍스트를 입력하면 AI가 자동으로 온톨로지를 구조화합니다. 또는 캔버스를 더블클릭해 노드를 직접 만들 수 있습니다.',
    icon: <MousePointerClick className="w-6 h-6" />,
    highlightArea: { top: '30%', left: '25%', width: '50%', height: '40%' },
  },
  {
    title: '노드를 클릭하면 상세 정보를 볼 수 있습니다',
    description:
      '생성된 노드를 클릭하면 오른쪽 패널에서 속성, 관계, 인스턴스 등의 상세 정보를 확인하고 편집할 수 있습니다.',
    icon: <MousePointerClick className="w-6 h-6" />,
    highlightArea: { top: '25%', left: '30%', width: '20%', height: '20%' },
  },
  {
    title: '노드 사이를 드래그하면 관계를 연결합니다',
    description:
      '한 노드에서 다른 노드로 드래그하면 관계(엣지)를 생성할 수 있습니다. 상속, 연관 등 다양한 관계를 설정하세요.',
    icon: <GripHorizontal className="w-6 h-6" />,
    highlightArea: { top: '20%', left: '20%', width: '60%', height: '30%' },
  },
];

export default function OnboardingGuide() {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable — skip onboarding
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    setVisible(false);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      completeOnboarding();
    }
  }, [currentStep, completeOnboarding]);

  const handleSkip = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  if (!visible) return null;

  const step = steps[currentStep];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="onboarding-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={overlay}
          className="fixed inset-0 z-[9999]"
        >
          {/* Semi-transparent backdrop with cutout highlight */}
          <div className="absolute inset-0">
            {/* Full overlay */}
            <div className="absolute inset-0 bg-black/60" />

            {/* Highlight cutout */}
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="absolute rounded-2xl border-2 border-primary/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] bg-transparent"
              style={{
                top: step.highlightArea.top,
                left: step.highlightArea.left,
                width: step.highlightArea.width,
                height: step.highlightArea.height,
              }}
            />
          </div>

          {/* Tooltip card */}
          <motion.div
            key={`tooltip-${currentStep}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-md"
          >
            <div className="bg-popover border border-border rounded-xl shadow-lg p-5 mx-4">
              {/* Step indicator */}
              <div className="flex items-center gap-1.5 mb-3">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === currentStep
                        ? 'w-6 bg-primary'
                        : i < currentStep
                          ? 'w-3 bg-primary/40'
                          : 'w-3 bg-muted-foreground/20'
                    }`}
                  />
                ))}
                <span className="ml-auto text-xs text-muted-foreground">
                  {currentStep + 1}/{steps.length}
                </span>
              </div>

              {/* Content */}
              <div className="flex items-start gap-3 mb-4">
                <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  {step.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    {step.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-8"
                  onClick={handleSkip}
                >
                  <X className="w-3 h-3 mr-1" />
                  건너뛰기
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={handleNext}
                >
                  {currentStep < steps.length - 1 ? (
                    <>
                      다음
                      <ArrowRight className="w-3 h-3" />
                    </>
                  ) : (
                    '시작하기'
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
