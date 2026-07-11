/**
 * useComposition — IME composition event handler hook
 * Supports CJK input method editors (IME) by tracking composition state.
 */
import { useRef, useCallback } from "react";

interface UseCompositionOptions<T extends HTMLElement> {
  onKeyDown?: (e: React.KeyboardEvent<T>) => void;
  onCompositionStart?: (e: React.CompositionEvent<T>) => void;
  onCompositionEnd?: (e: React.CompositionEvent<T>) => void;
}

interface UseCompositionResult<T extends HTMLElement> {
  onKeyDown: (e: React.KeyboardEvent<T>) => void;
  onCompositionStart: (e: React.CompositionEvent<T>) => void;
  onCompositionEnd: (e: React.CompositionEvent<T>) => void;
  isComposing: () => boolean;
}

export function useComposition<T extends HTMLElement>(
  options: UseCompositionOptions<T> = {}
): UseCompositionResult<T> {
  const composingRef = useRef(false);

  const onCompositionStart = useCallback(
    (e: React.CompositionEvent<T>) => {
      composingRef.current = true;
      options.onCompositionStart?.(e);
    },
    [options.onCompositionStart]
  );

  const onCompositionEnd = useCallback(
    (e: React.CompositionEvent<T>) => {
      composingRef.current = false;
      options.onCompositionEnd?.(e);
    },
    [options.onCompositionEnd]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<T>) => {
      options.onKeyDown?.(e);
    },
    [options.onKeyDown]
  );

  const isComposing = useCallback(() => composingRef.current, []);

  return { onKeyDown, onCompositionStart, onCompositionEnd, isComposing };
}
