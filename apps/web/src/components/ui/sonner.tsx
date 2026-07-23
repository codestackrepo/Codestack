import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          // Align sonner's richColors variants to our semantic tokens so toasts
          // don't bypass the palette (§13.6). Soft tinted fill, token-colored
          // text + border; all pass AA (verified via the token contrast gate).
          '--success-bg': 'color-mix(in oklab, var(--success) 12%, var(--popover))',
          '--success-border': 'color-mix(in oklab, var(--success) 38%, var(--popover))',
          '--success-text': 'var(--success)',
          '--error-bg': 'color-mix(in oklab, var(--destructive) 12%, var(--popover))',
          '--error-border': 'color-mix(in oklab, var(--destructive) 38%, var(--popover))',
          '--error-text': 'var(--destructive)',
          '--warning-bg': 'color-mix(in oklab, var(--warning) 12%, var(--popover))',
          '--warning-border': 'color-mix(in oklab, var(--warning) 38%, var(--popover))',
          '--warning-text': 'var(--warning)',
          '--info-bg': 'color-mix(in oklab, var(--info) 12%, var(--popover))',
          '--info-border': 'color-mix(in oklab, var(--info) 38%, var(--popover))',
          '--info-text': 'var(--info)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
