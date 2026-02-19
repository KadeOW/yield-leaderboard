'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  type ProtocolConfig,
  getRegistry,
  saveRegistry,
  addProtocol,
  updateProtocol,
  deleteProtocol,
} from '@/lib/registry';

export function useRegistry() {
  const [protocols, setProtocols] = useState<ProtocolConfig[]>([]);

  // Sync from localStorage on mount and on storage events (cross-tab)
  useEffect(() => {
    setProtocols(getRegistry());

    function onStorage(e: StorageEvent) {
      if (e.key === 'yield_protocol_registry') {
        setProtocols(getRegistry());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((config: Omit<ProtocolConfig, 'id' | 'addedAt'>) => {
    const entry = addProtocol(config);
    setProtocols(getRegistry());
    return entry;
  }, []);

  const update = useCallback((id: string, updates: Partial<ProtocolConfig>) => {
    updateProtocol(id, updates);
    setProtocols(getRegistry());
  }, []);

  const remove = useCallback((id: string) => {
    deleteProtocol(id);
    setProtocols(getRegistry());
  }, []);

  const toggle = useCallback((id: string) => {
    const current = getRegistry().find((p) => p.id === id);
    if (current) {
      updateProtocol(id, { enabled: !current.enabled });
      setProtocols(getRegistry());
    }
  }, []);

  // Direct save (for bulk operations)
  const save = useCallback((updated: ProtocolConfig[]) => {
    saveRegistry(updated);
    setProtocols(updated);
  }, []);

  return { protocols, add, update, remove, toggle, save };
}
