"use client";

import { useCallback } from "react";
import { useConnectionStore } from "@/stores/connection-store";
import { useExtractionStore } from "@/stores/extraction-store";
import type { ConnectionConfig, IntegrationPackage, IntegrationFlow, IFlowContent, ValueMapping, RuntimeArtifact, Configuration } from "@/types/cpi";

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(data.error || `API error: ${resp.status}`);
  }
  return resp.json();
}

export function useCpiExtract() {
  const config = useConnectionStore((s) => s.config);
  const {
    options,
    setResult,
    setExtracting,
    setProgress,
    addLog,
    clearLogs,
    addPackages,
    addFlows,
    addValueMappings,
    setRuntimeArtifacts,
    updateFlowConfigurations,
    updateFlowBundle,
    setSnapshotMeta,
  } = useExtractionStore();

  const extract = useCallback(async () => {
    setExtracting(true);
    clearLogs();
    setResult(null);

    // Initialize empty result with tenant URL
    setResult({
      extractedAt: new Date().toISOString(),
      tenantUrl: config.tenantUrl,
      packages: [],
      allFlows: [],
      allValueMappings: [],
      runtimeArtifacts: [],
    });

    try {
      // Step 1: Fetch packages
      if (options.extractPackages) {
        addLog("Fetching integration packages...");
        setProgress("Fetching packages...");

        const { packages } = await apiPost<{ packages: IntegrationPackage[] }>(
          "/api/extract/packages",
          { config }
        );
        addPackages(packages);
        addLog(`Found ${packages.length} packages`);

        // Step 2: Fetch flows per package
        if (options.extractFlows) {
          for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i];
            setProgress(`Fetching flows for package ${i + 1}/${packages.length}: ${pkg.name}`);
            addLog(`Fetching flows for: ${pkg.name}`);

            try {
              const { flows } = await apiPost<{ flows: IntegrationFlow[] }>(
                "/api/extract/flows",
                { config, packageId: pkg.id }
              );
              addFlows(flows);
              addLog(`  ${flows.length} flows found`);

              // Step 3: Fetch configurations per flow
              if (options.extractConfigurations) {
                for (const flow of flows) {
                  try {
                    const { configurations } = await apiPost<{ configurations: Configuration[] }>(
                      "/api/extract/configurations",
                      { config, flowId: flow.id, flowVersion: flow.version }
                    );
                    updateFlowConfigurations(flow.id, configurations);
                  } catch {
                    // Non-critical: some flows may not have configurations
                  }
                }
              }
            } catch (err) {
              addLog(`  Error fetching flows: ${err instanceof Error ? err.message : err}`);
            }
          }
        }

        // Step 4: Fetch value mappings per package
        if (options.extractValueMappings) {
          for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i];
            setProgress(`Fetching value mappings for package ${i + 1}/${packages.length}: ${pkg.name}`);

            try {
              const { valueMappings } = await apiPost<{ valueMappings: ValueMapping[] }>(
                "/api/extract/valuemappings",
                { config, packageId: pkg.id }
              );
              addValueMappings(valueMappings);
            } catch {
              // Non-critical
            }
          }
        }
      }

      // Step 5: Fetch runtime artifacts
      if (options.extractRuntime) {
        addLog("Fetching runtime artifacts...");
        setProgress("Fetching runtime status...");

        const { runtimeArtifacts } = await apiPost<{ runtimeArtifacts: RuntimeArtifact[] }>(
          "/api/extract/runtime",
          { config }
        );
        setRuntimeArtifacts(runtimeArtifacts);
        addLog(`Found ${runtimeArtifacts.length} runtime artifacts`);
      }

      // Step 6: Download & parse iFlow bundles
      if (options.extractIflowBundles) {
        const currentResult = useExtractionStore.getState().result;
        const allFlows = currentResult?.allFlows ?? [];
        addLog(`Downloading iFlow bundles for ${allFlows.length} flows...`);
        let parsed = 0;
        let failed = 0;

        for (let i = 0; i < allFlows.length; i++) {
          const flow = allFlows[i];
          setProgress(`Parsing bundle ${i + 1}/${allFlows.length}: ${flow.name}`);
          try {
            const { iflowContent } = await apiPost<{ iflowContent: IFlowContent }>(
              "/api/extract/bundle",
              { config, flowId: flow.id, flowVersion: flow.version }
            );
            updateFlowBundle(flow.id, iflowContent);
            parsed++;
          } catch {
            updateFlowBundle(flow.id, undefined);
            failed++;
          }
        }
        addLog(`Bundle parsing complete: ${parsed} parsed, ${failed} failed`);
      }

      setProgress("Extraction complete!");
      addLog("Extraction complete.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      addLog(`ERROR: ${msg}`);
      setProgress(`Error: ${msg}`);
    } finally {
      setExtracting(false);
    }
  }, [config, options, setResult, setExtracting, setProgress, addLog, clearLogs, addPackages, addFlows, addValueMappings, setRuntimeArtifacts, updateFlowConfigurations, updateFlowBundle]);

  /**
   * Refresh the currently loaded snapshot by fetching missing data from the CPI API.
   * - Fetches bundles for flows missing iflowContent
   * - Refreshes runtime status
   * - Fetches configurations for flows missing them
   */
  const refresh = useCallback(async () => {
    const currentResult = useExtractionStore.getState().result;
    if (!currentResult) return;

    setExtracting(true);
    clearLogs();
    addLog("Refreshing snapshot from CPI API...");

    try {
      const allFlows = currentResult.allFlows;

      // Refresh runtime status
      addLog("Refreshing runtime status...");
      setProgress("Fetching runtime status...");
      try {
        const { runtimeArtifacts } = await apiPost<{ runtimeArtifacts: RuntimeArtifact[] }>(
          "/api/extract/runtime",
          { config }
        );
        setRuntimeArtifacts(runtimeArtifacts);
        addLog(`Runtime: ${runtimeArtifacts.length} artifacts`);
      } catch (err) {
        addLog(`Runtime refresh failed: ${err instanceof Error ? err.message : err}`);
      }

      // Fetch configurations for flows missing them
      const flowsMissingConfigs = allFlows.filter(
        (f) => !f.configurations || f.configurations.length === 0
      );
      if (flowsMissingConfigs.length > 0) {
        addLog(`Fetching configurations for ${flowsMissingConfigs.length} flows...`);
        let configCount = 0;
        for (let i = 0; i < flowsMissingConfigs.length; i++) {
          const flow = flowsMissingConfigs[i];
          setProgress(`Configurations ${i + 1}/${flowsMissingConfigs.length}: ${flow.name}`);
          try {
            const { configurations } = await apiPost<{ configurations: Configuration[] }>(
              "/api/extract/configurations",
              { config, flowId: flow.id, flowVersion: flow.version }
            );
            if (configurations.length > 0) {
              updateFlowConfigurations(flow.id, configurations);
              configCount += configurations.length;
            }
          } catch {
            // Non-critical
          }
        }
        addLog(`Configurations: ${configCount} parameters fetched`);
      }

      // Fetch bundles for flows missing iflowContent
      const flowsMissingBundles = allFlows.filter((f) => !f.iflowContent);
      if (flowsMissingBundles.length > 0) {
        addLog(`Downloading bundles for ${flowsMissingBundles.length} flows (${allFlows.length - flowsMissingBundles.length} already have bundles)...`);
        let parsed = 0;
        let failed = 0;

        for (let i = 0; i < flowsMissingBundles.length; i++) {
          const flow = flowsMissingBundles[i];
          setProgress(`Parsing bundle ${i + 1}/${flowsMissingBundles.length}: ${flow.name}`);
          try {
            const { iflowContent } = await apiPost<{ iflowContent: IFlowContent }>(
              "/api/extract/bundle",
              { config, flowId: flow.id, flowVersion: flow.version }
            );
            updateFlowBundle(flow.id, iflowContent);
            parsed++;
          } catch {
            updateFlowBundle(flow.id, undefined);
            failed++;
          }
        }
        addLog(`Bundles: ${parsed} parsed, ${failed} failed`);
      } else {
        addLog("All flows already have bundle data.");
      }

      setSnapshotMeta("Refreshed snapshot");
      setProgress("Refresh complete!");
      addLog("Refresh complete.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Refresh failed";
      addLog(`ERROR: ${msg}`);
      setProgress(`Error: ${msg}`);
    } finally {
      setExtracting(false);
    }
  }, [config, setExtracting, clearLogs, addLog, setProgress, setRuntimeArtifacts, updateFlowConfigurations, updateFlowBundle, setSnapshotMeta]);

  return { extract, refresh };
}
