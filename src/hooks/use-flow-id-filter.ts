import { useState, useEffect } from "react";
import type { ExtractionResult } from "@/types/cpi";

/**
 * Reads ?flowId= from the URL and resolves it to a flow name
 * for use as a DataTable initialFilter. Uses window.location
 * instead of useSearchParams to avoid Suspense requirements.
 */
export function useFlowIdFilter(extractionResult: ExtractionResult | null): string {
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const flowId = params.get("flowId");
    if (!flowId || !extractionResult) return;

    const flow = extractionResult.allFlows.find((f) => f.id === flowId);
    setFilter(flow?.name ?? flowId);
  }, [extractionResult]);

  return filter;
}
