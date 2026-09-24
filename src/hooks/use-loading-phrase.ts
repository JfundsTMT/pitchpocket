import { useEffect, useRef, useState } from 'react';

const DEFAULT_INTERVAL_MS = 1800;

// Cycles through a list of phrases while `active` is true — small
// personality during a wait instead of a single static "Loading…" line.
// Resets to the first phrase whenever the wait ends, so the next wait
// always starts from the same beat.
export function useLoadingPhrase(active: boolean, phrases: string[], intervalMs = DEFAULT_INTERVAL_MS): string {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active) {
      indexRef.current = 0;
      setIndex(0);
      return;
    }
    if (phrases.length <= 1) return;
    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % phrases.length;
      setIndex(indexRef.current);
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, phrases, intervalMs]);

  return phrases[index] ?? phrases[0] ?? '';
}
