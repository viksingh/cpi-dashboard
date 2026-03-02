import { create } from 'zustand';
import type { ConnectionConfig } from '@/types/cpi';

interface ConnectionState {
  config: ConnectionConfig;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  setConfig: (config: Partial<ConnectionConfig>) => void;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const defaultConfig: ConnectionConfig = {
  tenantUrl: '',
  authType: 'oauth2',
  oauthTokenUrl: '',
  oauthClientId: '',
  oauthClientSecret: '',
  basicUsername: '',
  basicPassword: '',
};

// Load saved tenant URL from localStorage (secrets are NOT persisted)
function loadSavedTenantUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem('cpi-tenant-url') || '';
  } catch {
    return '';
  }
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  config: { ...defaultConfig, tenantUrl: loadSavedTenantUrl() },
  isConnected: false,
  isConnecting: false,
  error: null,
  setConfig: (partial) =>
    set((state) => {
      const newConfig = { ...state.config, ...partial };
      // Persist tenant URL only
      if (partial.tenantUrl !== undefined && typeof window !== 'undefined') {
        try {
          localStorage.setItem('cpi-tenant-url', partial.tenantUrl);
        } catch { /* ignore */ }
      }
      return { config: newConfig };
    }),
  setConnected: (isConnected) => set({ isConnected }),
  setConnecting: (isConnecting) => set({ isConnecting }),
  setError: (error) => set({ error }),
  reset: () => set({ config: defaultConfig, isConnected: false, isConnecting: false, error: null }),
}));
