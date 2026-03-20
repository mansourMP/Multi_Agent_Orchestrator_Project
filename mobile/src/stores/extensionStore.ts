import { create } from 'zustand';
import { APP_CATALOG } from '@/src/lib/appCatalog';

export interface Module {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'Hub' | 'Tool' | 'Agent' | 'Automation';
  status: 'installed' | 'available' | 'pending';
  version: string;
  latestVersion?: string;
  pinned?: boolean;
}

interface ExtensionState {
  isSheetVisible: boolean;
  activeExtensionId: string | null;
  installedModules: Module[];
  setSheetVisible: (visible: boolean) => void;
  setActiveExtension: (id: string | null) => void;
  installModule: (module: Module) => void;
  uninstallModule: (id: string) => void;
  togglePin: (id: string) => void;
}

export const useExtensionStore = create<ExtensionState>((set) => ({
  isSheetVisible: false,
  activeExtensionId: null,
  installedModules: APP_CATALOG.map((app) => ({
    id: app.id,
    name: app.name,
    description: app.description || '',
    icon: app.icon,
    category: 'Hub',
    status: app.defaultStatus === 'installed' ? 'installed' : 'available',
    version: app.version || '1.0.0',
    latestVersion: app.latestVersion,
    pinned: app.defaultStatus === 'installed',
  })),
  setSheetVisible: (visible) => set({ isSheetVisible: visible }),
  setActiveExtension: (id) => set({ activeExtensionId: id }),
  installModule: (module) => set((state) => ({ 
    installedModules: state.installedModules.map(m => m.id === module.id ? { ...m, status: 'installed', pinned: true } : m) 
  })),
  uninstallModule: (id) => set((state) => ({ 
    installedModules: state.installedModules.map(m => m.id === id ? { ...m, status: 'available', pinned: false } : m) 
  })),
  togglePin: (id) => set((state) => ({
    installedModules: state.installedModules.map(m => m.id === id ? { ...m, pinned: !m.pinned } : m)
  })),
}));
