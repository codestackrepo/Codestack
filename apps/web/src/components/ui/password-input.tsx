import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Password field with a reveal toggle.
 *
 * `type` is owned by this component, not the caller — the whole point is that it
 * flips between `password` and `text`, so accepting one would let a caller pin it
 * and silently break the toggle.
 *
 * Visibility is deliberately local and resets to hidden on every mount: a revealed
 * password must not survive a navigation back to the form.
 */
function PasswordInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = React.useState(false);

  return (
    // Positioning context for the toggle. Nesting inside a caller's own `relative`
    // wrapper (the forms that render a left-hand Lock icon) is fine — that icon
    // anchors to the outer box, this button to the input itself.
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        // Reserve the track the button sits in, so a long value scrolls under the
        // label rather than behind the icon.
        className={cn('pr-9', className)}
      />
      <button
        // Explicit, because a bare <button> inside a <form> defaults to
        // type="submit" — revealing the password would submit the form.
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export { PasswordInput };
