"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ExtractionResult } from "@/types/cpi";

interface BundleWarningProps {
  result: ExtractionResult;
}

export function BundleWarning({ result }: BundleWarningProps) {
  const totalFlows = result.allFlows.length;
  if (totalFlows === 0) return null;

  const parsedCount = result.allFlows.filter((f) => f.bundleParsed && f.iflowContent).length;
  if (parsedCount > 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>No iFlow bundle data found</AlertTitle>
      <AlertDescription>
        This snapshot has {totalFlows} flows but none include parsed bundle data (adapters, routes, scripts).
        Analysis tools require bundle data to work. Re-extract with the{" "}
        <strong>&quot;iFlow Bundles (deep analysis)&quot;</strong> option enabled on the Extractor page.
      </AlertDescription>
    </Alert>
  );
}
