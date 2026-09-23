import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: string;
  className?: string;
  showCloseButton?: boolean;
  showHandle?: boolean;
  id?: string;
  isDark?: boolean;
}

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = 'max-h-[88vh]',
  className = '',
  showCloseButton = true,
  showHandle = true,
  id = 'mobile-bottom-sheet',
  isDark = false,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Manage body scroll locking
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      id={id}
      data-testid={id}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"
    >
      {/* Semi-transparent backdrop with click-to-dismiss */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-up sheet panel */}
      <div
        ref={sheetRef}
        className={`relative z-10 w-full ${maxHeight} flex flex-col rounded-t-3xl shadow-2xl transition-transform border-t duration-300 ease-out animate-slide-up ${
          isDark
            ? 'bg-[#0B132B] border-[#1C2541] text-slate-100'
            : 'bg-white border-[#C8D9E6] text-[#2F4156]'
        } ${className}`}
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 16px))',
        }}
      >
        {/* Drag handle */}
        {showHandle && (
          <div
            className="w-full flex justify-center pt-3 pb-1 cursor-grab select-none"
            onClick={onClose}
            title="Tap to dismiss"
          >
            <div
              className={`w-12 h-1.5 rounded-full transition-colors ${
                isDark ? 'bg-slate-700' : 'bg-slate-300'
              }`}
            />
          </div>
        )}

        {/* Sheet Header */}
        {(title || showCloseButton) && (
          <div
            className={`px-5 py-3 flex items-start justify-between gap-3 border-b flex-shrink-0 ${
              isDark ? 'border-[#1C2541]' : 'border-[#F5EFEB]'
            }`}
          >
            <div className="min-w-0 flex-1">
              {title && (
                <h3
                  className={`text-base font-bold font-['Space_Grotesk',sans-serif] leading-tight truncate ${
                    isDark ? 'text-white' : 'text-[#2F4156]'
                  }`}
                >
                  {title}
                </h3>
              )}
              {subtitle && (
                <p
                  className={`text-xs mt-0.5 leading-normal ${
                    isDark ? 'text-slate-400' : 'text-[#567C8D]'
                  }`}
                >
                  {subtitle}
                </p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sheet"
                className={`min-w-[44px] min-h-[44px] -mr-2 -mt-1 p-2.5 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                  isDark
                    ? 'text-slate-400 hover:text-white hover:bg-[#1C2541]'
                    : 'text-[#567C8D] hover:text-[#2F4156] hover:bg-[#F5EFEB]'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Sheet Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
};
