import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { AqiCategoryInfo } from '../../types/airQuality.ts';

interface AqiScaleBadgeProps {
  category: AqiCategoryInfo;
  size?: 'sm' | 'md' | 'lg';
}

export const AqiScaleBadge: React.FC<AqiScaleBadgeProps> = ({ category, size = 'md' }) => {
  const Icon =
    category.level === 'good'
      ? CheckCircle2
      : category.level === 'moderate'
        ? ShieldCheck
        : category.level === 'sensitive'
          ? AlertTriangle
          : category.level === 'unknown'
            ? HelpCircle
            : ShieldAlert;

  const paddingClass =
    size === 'sm' ? 'px-2.5 py-1 text-xs' : size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-3 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border font-medium whitespace-nowrap shrink-0 ${paddingClass} ${category.bgTintClass} ${category.borderTintClass} ${category.textTintClass}`}
      aria-label={`Air quality category: ${category.label}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{category.label}</span>
    </span>
  );
};
