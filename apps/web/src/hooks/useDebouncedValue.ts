import { useEffect, useState } from 'react';

// The value, but only after it has stopped changing for `delay` ms — so
// typing in a search box fires one request, not one per keystroke.
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
