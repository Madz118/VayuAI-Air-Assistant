import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateCardProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export const ErrorStateCard: React.FC<ErrorStateCardProps> = ({
  title = 'Environmental Data Unavailable',
  message,
  onRetry,
  retrying = false,
}) => {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-400/25 bg-[#102334]/95 p-6 text-[#F2F7FA]"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-[#F2F7FA]">{title}</h3>
          <p className="mt-1.5 text-sm text-[#9BB0C0] leading-relaxed">{message}</p>
          <p className="mt-2 text-xs text-[#9BB0C0]">
            VAYU AI does not substitute simulated readings when live environmental providers are unreachable.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#16C7B0] px-4 py-2 text-xs font-semibold text-[#07111F] hover:bg-[#49E3D0] transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{retrying ? 'Retrying...' : 'Retry Live Fetch'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
