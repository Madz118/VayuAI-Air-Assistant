import React, { useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { UserPreferences } from '../../types/airQuality.ts';
import { useModalFocusTrap } from '../../utils/useModalFocusTrap.ts';

interface PreferencesModalProps {
  open: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onUpdate: (patch: Partial<UserPreferences>) => void;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  open,
  onClose,
  preferences,
  onUpdate,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useModalFocusTrap({
    open,
    containerRef: dialogRef,
    initialFocusRef: closeBtnRef,
    onClose,
  });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prefs-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#07111F]/80 p-4"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0B1928] p-6 shadow-2xl focus:outline-none"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
            <h2 id="prefs-modal-title" className="text-lg font-semibold text-[#F2F7FA]">
              Display Preferences
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close preferences modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <span className="block text-xs font-medium text-[#B5C7D4] mb-2">
              Air Quality Index Scale
            </span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Air Quality Index Scale">
              <button
                type="button"
                aria-pressed={preferences.preferredScale === 'us_aqi'}
                onClick={() => onUpdate({ preferredScale: 'us_aqi' })}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  preferences.preferredScale === 'us_aqi'
                    ? 'border-[#49E3D0]/60 bg-[#16C7B0]/15 text-[#F2F7FA]'
                    : 'border-white/10 bg-[#102334] text-[#B5C7D4] hover:text-[#F2F7FA]'
                }`}
              >
                <div className="text-xs font-semibold">US EPA AQI</div>
                <div className="text-xs text-[#9BB0C0] mt-0.5">0–500 scale</div>
              </button>
              <button
                type="button"
                aria-pressed={preferences.preferredScale === 'european_aqi'}
                onClick={() => onUpdate({ preferredScale: 'european_aqi' })}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  preferences.preferredScale === 'european_aqi'
                    ? 'border-[#49E3D0]/60 bg-[#16C7B0]/15 text-[#F2F7FA]'
                    : 'border-white/10 bg-[#102334] text-[#B5C7D4] hover:text-[#F2F7FA]'
                }`}
              >
                <div className="text-xs font-semibold">European EAQI</div>
                <div className="text-xs text-[#9BB0C0] mt-0.5">0–100+ scale</div>
              </button>
            </div>
            <p className="mt-2 text-xs text-[#9BB0C0] leading-relaxed">
              Note: Neither Open-Meteo scale is official Indian CPCB AQI; the active scale is always labelled explicitly.
            </p>
          </div>

          <div>
            <span className="block text-xs font-medium text-[#B5C7D4] mb-2">
              Temperature Unit
            </span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Temperature Unit">
              <button
                type="button"
                aria-pressed={preferences.temperatureUnit === 'celsius'}
                onClick={() => onUpdate({ temperatureUnit: 'celsius' })}
                className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                  preferences.temperatureUnit === 'celsius'
                    ? 'border-[#49E3D0]/60 bg-[#16C7B0]/15 text-[#F2F7FA]'
                    : 'border-white/10 bg-[#102334] text-[#B5C7D4] hover:text-[#F2F7FA]'
                }`}
              >
                Celsius (°C)
              </button>
              <button
                type="button"
                aria-pressed={preferences.temperatureUnit === 'fahrenheit'}
                onClick={() => onUpdate({ temperatureUnit: 'fahrenheit' })}
                className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                  preferences.temperatureUnit === 'fahrenheit'
                    ? 'border-[#49E3D0]/60 bg-[#16C7B0]/15 text-[#F2F7FA]'
                    : 'border-white/10 bg-[#102334] text-[#B5C7D4] hover:text-[#F2F7FA]'
                }`}
              >
                Fahrenheit (°F)
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#102334] p-3.5">
            <div>
              <label htmlFor="reduced-motion-toggle" className="block text-xs font-semibold text-[#F2F7FA] cursor-pointer">
                Reduce 3D Wind Motion
              </label>
              <span className="block text-xs text-[#9BB0C0] mt-0.5">
                Holds the 3D atmospheric background still for visual comfort.
              </span>
            </div>
            <input
              id="reduced-motion-toggle"
              type="checkbox"
              checked={preferences.reducedMotion}
              onChange={(e) => onUpdate({ reducedMotion: e.target.checked })}
              className="h-5 w-5 accent-[#16C7B0] rounded cursor-pointer shrink-0"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#16C7B0] px-5 py-2.5 text-xs font-semibold text-[#07111F] hover:bg-[#49E3D0]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
