import { create } from 'zustand';
import type {
  ExtractionResult,
  ExtractionOptions,
  IntegrationPackage,
  IntegrationFlow,
  ValueMapping,
  RuntimeArtifact,
  FilterMode,
} from '@/types/cpi';

interface ExtractionState {
  options: ExtractionOptions;
  result: ExtractionResult | null;
  isExtracting: boolean;
  progress: string;
  logs: string[];

  setOptions: (opts: Partial<ExtractionOptions>) => void;
  setResult: (result: ExtractionResult | null) => void;
  setExtracting: (extracting: boolean) => void;
  setProgress: (progress: string) => void;
  addLog: (log: string) => void;
  clearLogs: () => void;

  // Incremental update methods
  addPackages: (pkgs: IntegrationPackage[]) => void;
  addFlows: (flows: IntegrationFlow[]) => void;
  addValueMappings: (vms: ValueMapping[]) => void;
  setRuntimeArtifacts: (artifacts: RuntimeArtifact[]) => void;
  updateFlowConfigurations: (flowId: string, configs: { parameterKey: string; parameterValue: string; dataType: string }[]) => void;
  updateFlowBundle: (flowId: string, iflowContent: IntegrationFlow['iflowContent']) => void;
}

const defaultOptions: ExtractionOptions = {
  extractPackages: true,
  extractFlows: true,
  extractValueMappings: true,
  extractConfigurations: true,
  extractRuntime: true,
  extractIflowBundles: true,
  dateFilterEnabled: false,
  sinceDate: null,
  dateFilterMode: 'MODIFIED_SINCE' as FilterMode,
};

export const useExtractionStore = create<ExtractionState>((set) => ({
  options: defaultOptions,
  result: null,
  isExtracting: false,
  progress: '',
  logs: [],

  setOptions: (opts) =>
    set((state) => ({ options: { ...state.options, ...opts } })),
  setResult: (result) => set({ result }),
  setExtracting: (isExtracting) => set({ isExtracting }),
  setProgress: (progress) => set({ progress }),
  addLog: (log) =>
    set((state) => ({ logs: [...state.logs, `[${new Date().toLocaleTimeString()}] ${log}`] })),
  clearLogs: () => set({ logs: [] }),

  addPackages: (pkgs) =>
    set((state) => {
      const current = state.result || createEmptyResult();
      return {
        result: {
          ...current,
          packages: [...current.packages, ...pkgs],
          totalPackages: (current.totalPackages || 0) + pkgs.length,
        },
      };
    }),

  addFlows: (flows) =>
    set((state) => {
      const current = state.result || createEmptyResult();
      return {
        result: {
          ...current,
          allFlows: [...current.allFlows, ...flows],
          totalFlows: (current.totalFlows || 0) + flows.length,
        },
      };
    }),

  addValueMappings: (vms) =>
    set((state) => {
      const current = state.result || createEmptyResult();
      return {
        result: {
          ...current,
          allValueMappings: [...current.allValueMappings, ...vms],
          totalValueMappings: (current.totalValueMappings || 0) + vms.length,
        },
      };
    }),

  setRuntimeArtifacts: (artifacts) =>
    set((state) => {
      const current = state.result || createEmptyResult();
      return {
        result: {
          ...current,
          runtimeArtifacts: artifacts,
          deployedArtifacts: artifacts.filter((a) => a.status === 'STARTED').length,
          errorArtifacts: artifacts.filter((a) => a.status === 'ERROR').length,
        },
      };
    }),

  updateFlowConfigurations: (flowId, configs) =>
    set((state) => {
      if (!state.result) return {};
      const allFlows = state.result.allFlows.map((f) =>
        f.id === flowId ? { ...f, configurations: configs } : f
      );
      return { result: { ...state.result, allFlows } };
    }),

  updateFlowBundle: (flowId, iflowContent) =>
    set((state) => {
      if (!state.result) return {};
      const allFlows = state.result.allFlows.map((f) =>
        f.id === flowId
          ? { ...f, iflowContent, bundleParsed: !!iflowContent }
          : f
      );
      return { result: { ...state.result, allFlows } };
    }),
}));

function createEmptyResult(): ExtractionResult {
  return {
    extractedAt: new Date().toISOString(),
    tenantUrl: '',
    packages: [],
    allFlows: [],
    allValueMappings: [],
    runtimeArtifacts: [],
    totalPackages: 0,
    totalFlows: 0,
    totalValueMappings: 0,
    deployedArtifacts: 0,
    errorArtifacts: 0,
  };
}
