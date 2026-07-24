import { useEffect, useRef } from 'react';

/**
 * Scroll-reveal orchestrator (§14.2). Attach the returned ref to a container;
 * mark any descendant (or the container itself) with the `reveal` class to have
 * it fade/slide in when it first scrolls into view. Stagger siblings with an
 * inline `style={{ '--reveal-delay': '80ms' }}`.
 *
 * Reveals imperatively (toggles `.in-view`) so it never re-renders React, and
 * honors `prefers-reduced-motion` by revealing everything immediately. One-shot:
 * each target is unobserved after it appears.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets: HTMLElement[] = [];
    if (root.classList.contains('reveal')) targets.push(root);
    targets.push(...root.querySelectorAll<HTMLElement>('.reveal'));
    if (targets.length === 0) return;

    // Reduced motion: skip the animation, show content now.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('in-view'));
      return;
    }

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            obs.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return ref;
}
