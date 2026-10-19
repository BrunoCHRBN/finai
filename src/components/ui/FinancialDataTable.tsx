'use client';

import React from 'react';

export interface FinancialDataTableProps {
  children: React.ReactNode;
  headerTitle?: string;
  headerIcon?: React.ComponentType<{ className?: string }>;
  headerActions?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function FinancialDataTable({
  children,
  headerTitle,
  headerIcon: HeaderIcon,
  headerActions,
  title,
  description,
  action,
  footer,
  className = '',
}: FinancialDataTableProps) {
  const displayTitle = headerTitle || title;
  const displayActions = headerActions || action;

  return (
    <div className={`rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] overflow-hidden shadow-xs ${className}`}>
      {(displayTitle || displayActions || description) && (
        <div className="px-4 sm:px-5 py-3 border-b border-[#E7E1D7] bg-[#FAF8F5] flex flex-wrap items-center justify-between gap-2.5">
          {displayTitle && (
            <div>
              <div className="flex items-center gap-2">
                {HeaderIcon && <HeaderIcon className="w-4 h-4 text-[#253A32]" />}
                <h3 className="font-serif text-sm font-bold text-[#242823]">{displayTitle}</h3>
              </div>
              {description && (
                <p className="text-[11px] text-[#777A72] font-sans mt-0.5">{description}</p>
              )}
            </div>
          )}
          {displayActions && <div className="flex items-center gap-2">{displayActions}</div>}
        </div>
      )}

      {/* Overflow-x container for tables */}
      <div className="w-full overflow-x-auto relative">
        {children}
      </div>

      {footer && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-[#E7E1D7] bg-[#FAF8F5] text-xs text-[#5F635C]">
          {footer}
        </div>
      )}
    </div>
  );
}
