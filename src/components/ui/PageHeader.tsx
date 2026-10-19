'use client';

import React from 'react';

interface PageHeaderProps {
  kicker?: string;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  kicker,
  title,
  description,
  badge,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`pb-4 border-b border-[#E7E1D7] flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0 flex-1">
        {kicker && (
          <div className="text-[10px] sm:text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72] mb-1">
            {kicker}
          </div>
        )}
        <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl text-[#242823] tracking-tight truncate">
          {title}
        </h1>
        {description && (
          <p className="text-xs font-sans text-[#5F635C] mt-1 leading-relaxed max-w-3xl">
            {description}
          </p>
        )}
      </div>

      {(badge || actions) && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          {badge}
          {actions}
        </div>
      )}
    </div>
  );
}
