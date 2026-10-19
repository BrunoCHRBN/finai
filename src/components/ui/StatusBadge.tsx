'use client';

import React from 'react';

export type StatusBadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

export interface StatusBadgeProps {
  variant?: StatusBadgeVariant;
  status?: string;
  label?: string;
  children?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  size?: 'sm' | 'md';
  className?: string;
}

const variantStyles: Record<StatusBadgeVariant, string> = {
  success: 'bg-[#E4EFE6] border-[#D1E2D4] text-[#245A3C]',
  warning: 'bg-[#F5EEDB] border-[#E8DEC7] text-[#795C24]',
  danger: 'bg-[#F8E8E5] border-[#EED0CC] text-[#963F36]',
  info: 'bg-[#EBF2FA] border-[#D0E1F9] text-[#2A4365]',
  neutral: 'bg-[#F0EDE6] border-[#E7E1D7] text-[#5F635C]',
  brand: 'bg-[#253A32]/10 border-[#253A32]/20 text-[#253A32]',
};

export function StatusBadge({
  variant,
  status,
  label,
  children,
  icon: Icon,
  size = 'md',
  className = '',
}: StatusBadgeProps) {
  const rawKey = (variant || status || 'neutral').toLowerCase();
  const effectiveVariant: StatusBadgeVariant = (rawKey in variantStyles ? rawKey : 'neutral') as StatusBadgeVariant;
  const sizeClasses = size === 'sm' 
    ? 'text-[10px] px-2 py-0.5 gap-1' 
    : 'text-xs px-2.5 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-sans font-medium rounded-md border ${variantStyles[effectiveVariant]} ${sizeClasses} ${className}`}
    >
      {Icon && <Icon className={size === 'sm' ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />}
      <span>{label ?? children}</span>
    </span>
  );
}
