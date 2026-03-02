"use client";

import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import type { ExtractionResult } from "@/types/cpi";

interface SnapshotLoaderProps {
  onLoad: (result: ExtractionResult, fileName: string) => void;
  label?: string;
}

export function SnapshotLoader({ onLoad, label = "Load Snapshot" }: SnapshotLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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

        onLoad(data, file.name);
        toast.success(`Loaded snapshot: ${file.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to parse snapshot";
        toast.error(msg);
      }

      // Reset input
      if (inputRef.current) inputRef.current.value = "";
    },
    [onLoad]
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
