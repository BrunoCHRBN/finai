'use client';

import React from 'react';

interface MetricCardProps {
  label: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  value: string | number;
  valueClassName?: string;
  subtext?: string;
  tone?: string;
  footer?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  label,
  badge,
  icon,
  value,
  valueClassName = 'text-[#242823]',
  subtext,
  footer,
  className = '',
}: MetricCardProps) {
  return (
    <div
      className={`p-4 sm:p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between transition-shadow hover:shadow-sm ${className}`}
    >
      <div>
        <div className="flex items-center justify-between text-xs text-[#5F635C] mb-2 font-sans gap-2">
          <span className="font-medium truncate">{label}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {badge}
            {icon}
          </div>
        </div>

        <div className={`font-serif text-2xl sm:text-3xl font-bold tabular-nums tracking-tight mt-1 truncate ${valueClassName}`}>
          {value}
        </div>

        {subtext && (
          <div className="text-[11px] sm:text-xs text-[#5F635C] font-sans mt-1.5 leading-relaxed">
            {subtext}
          </div>
        )}
      </div>

      {footer && (
        <div className="pt-3 mt-3 sm:pt-4 sm:mt-4 border-t border-[#F0EDE6] text-xs font-sans">
          {footer}
        </div>
      )}
    </div>
  );
}
