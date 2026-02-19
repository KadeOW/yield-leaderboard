'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'yield_watch_list';

export function useWatchList() {
  const [addresses, setAddresses] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setAddresses(JSON.parse(stored));
    } catch {}
  }, []);

  const add = useCallback((address: string) => {
    setAddresses((prev) => {
      if (prev.some((a) => a.toLowerCase() === address.toLowerCase())) return prev;
      const next = [...prev, address];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const remove = useCallback((address: string) => {
    setAddresses((prev) => {
      const next = prev.filter((a) => a.toLowerCase() !== address.toLowerCase());
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { addresses, add, remove };
}
