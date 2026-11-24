import React, { useRef } from 'react';
import { AlertTriangle, Bell, Check, Info, ShieldAlert, X } from 'lucide-react';
import type { VayuNotification } from '../../context/VayuContext.tsx';
import { useModalFocusTrap } from '../../utils/useModalFocusTrap.ts';

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: VayuNotification[];
  onDismiss: (id: string) => void;
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  open,
  onClose,
  notifications,
  onDismiss,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useModalFocusTrap({
    open,
    containerRef: panelRef,
    initialFocusRef: closeBtnRef,
    onClose,
  });

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Environmental advisories and notifications"
      className="fixed right-4 top-16 z-50 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#0B1928] p-4 shadow-2xl focus:outline-none"
    >
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[#F2F7FA]">Active Advisories</h2>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close notifications"
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="py-6 text-center">
          <Check className="w-6 h-6 text-[#16C7B0] mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-[#F2F7FA]">No active advisories</p>
          <p className="text-xs text-[#9BB0C0] mt-1">
            Modelled air quality and data freshness are within nominal thresholds.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5 max-h-80 overflow-y-auto">
          {notifications.map((item) => {
            const Icon =
              item.severity === 'alert'
                ? ShieldAlert
                : item.severity === 'warning'
                  ? AlertTriangle
                  : Info;
            const iconColor =
              item.severity === 'alert'
                ? 'text-red-400'
                : item.severity === 'warning'
                  ? 'text-amber-300'
                  : 'text-[#55B8E8]';

            return (
              <li
                key={item.id}
                className="rounded-xl border border-white/10 bg-[#102334] p-3 text-left"
              >
                <div className="flex items-start gap-2.5">
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-[#F2F7FA]">{item.title}</p>
                      <button
                        type="button"
                        onClick={() => onDismiss(item.id)}
                        aria-label={`Dismiss ${item.title}`}
                        className="p-1 rounded text-[#B5C7D4] hover:text-[#F2F7FA] shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-[#B5C7D4] leading-relaxed">{item.detail}</p>
                    <p className="mt-1.5 font-mono text-xs text-[#9BB0C0]">{item.timestamp}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
