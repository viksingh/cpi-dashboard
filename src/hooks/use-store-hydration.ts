import { useEffect, useState } from "react";

/**
 * Returns true once the Zustand persisted store has finished
 * rehydrating from IndexedDB. Until then, `result` will be null
 * even if data exists in storage.
 */
export function useStoreHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Zustand persist middleware fires onRehydrateStorage synchronously
    // after the first render, so by the time useEffect runs, it's done.
    setHydrated(true);
  }, []);

  return hydrated;
}
