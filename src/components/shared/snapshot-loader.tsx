"use client";

import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { useExtractionStore } from "@/stores/extraction-store";
import type { ExtractionResult } from "@/types/cpi";

interface SnapshotLoaderProps {
  /** Optional callback for local-only mode (e.g. diff page). When provided, data is NOT written to global store. */
  onLoad?: (result: ExtractionResult, fileName: string) => void;
  label?: string;
}

export function SnapshotLoader({ onLoad, label = "Load Snapshot" }: SnapshotLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setResult = useExtractionStore((s) => s.setResult);
  const setSnapshotMeta = useExtractionStore((s) => s.setSnapshotMeta);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text) as ExtractionResult;

        if (!data.packages && !data.allFlows) {
          throw new Error("Invalid snapshot format: missing packages or allFlows");
        }

        // Normalize: ensure arrays exist
        data.packages = data.packages || [];
        data.allFlows = data.allFlows || [];
        data.allValueMappings = data.allValueMappings || [];
        data.runtimeArtifacts = data.runtimeArtifacts || [];

        if (onLoad) {
          // Local-only mode (diff page)
          onLoad(data, file.name);
        } else {
          // Global store mode — persists to IndexedDB
          setResult(data);
          setSnapshotMeta(file.name);
        }

        toast.success(`Loaded snapshot: ${file.name}`);

        // Warn if no flows have parsed bundle data
        const totalFlows = data.allFlows?.length ?? 0;
        const parsedBundles = data.allFlows?.filter((f) => f.bundleParsed && f.iflowContent).length ?? 0;
        if (totalFlows > 0 && parsedBundles === 0) {
          toast.warning(
            "Snapshot has no iFlow bundle data. Analysis tools need bundles to work. Re-extract with \"iFlow Bundles\" enabled.",
            { duration: 8000 }
          );
        } else if (totalFlows > 0 && parsedBundles < totalFlows) {
          toast.info(
            `${parsedBundles}/${totalFlows} flows have bundle data. Some analysis results may be incomplete.`,
            { duration: 5000 }
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to parse snapshot";
        toast.error(msg);
      }

      // Reset input
      if (inputRef.current) inputRef.current.value = "";
    },
    [onLoad, setResult, setSnapshotMeta]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button variant="outline" onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" />
        {label}
      </Button>
    </>
  );
}
