'use client';

import React from 'react';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`py-10 sm:py-14 px-4 text-center rounded-lg border border-dashed border-[#D6CFC2] bg-[#FAF8F5] flex flex-col items-center justify-center gap-3 ${className}`}
    >
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-[#F0EDE6] border border-[#E7E1D7] flex items-center justify-center text-[#5F635C]">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="max-w-md">
        <h4 className="font-serif text-base font-bold text-[#242823]">{title}</h4>
        {description && (
          <p className="text-xs text-[#5F635C] font-sans mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
