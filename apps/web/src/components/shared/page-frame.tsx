import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Centralizes page content width (§13.8 decision 3). Pages adopt this during the
 * Phase 3 sweep instead of hardcoding `max-w-*`:
 *   default ~1200px · wide ~1440px (gradebook, admin users, module matrix) ·
 *   full (editors / dashboards that manage their own width).
 * AppShell still applies its own padding + a `max-w-7xl` default until pages
 * migrate, so nesting a PageFrame is safe (it only ever narrows).
 */
const WIDTHS = {
  default: 'max-w-[75rem]',
  wide: 'max-w-[90rem]',
  full: 'max-w-none',
} as const;

export function PageFrame({
  width = 'default',
  className,
  ...props
}: React.ComponentProps<'div'> & { width?: keyof typeof WIDTHS }) {
  return <div className={cn('mx-auto w-full', WIDTHS[width], className)} {...props} />;
}
