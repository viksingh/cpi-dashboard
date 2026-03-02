"use client";

import { useExtractionStore } from "@/stores/extraction-store";
import { useCpiExtract } from "@/hooks/use-cpi-extract";
import { ConnectionForm } from "@/components/shared/connection-form";
import { LogPanel } from "@/components/shared/log-panel";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Camera, Download, Loader2, Save, Upload, Package, Workflow, Activity, Database } from "lucide-react";
import { BundleWarning } from "@/components/shared/bundle-warning";
import { exportJson } from "@/exporters/json-exporter";
import type { ExtractionResult } from "@/types/cpi";

export default function SnapshotPage() {
  const { result, isExtracting, progress, logs, setResult } = useExtractionStore();
  const { extract } = useCpiExtract();

  const handleSaveSnapshot = () => {
    if (result) exportJson(result, "cpi-snapshot");
  };

  const handleLoadSnapshot = (data: ExtractionResult) => {
    setResult(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Snapshot Creator</h1>
        <p className="text-muted-foreground">
          Create and manage JSON snapshots of your CPI tenant for offline analysis
        </p>
      </div>

      <ConnectionForm />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" />
            Create Snapshot
          </CardTitle>
          <CardDescription>
            Extract all data from your CPI tenant and save as a JSON snapshot file
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={extract} disabled={isExtracting}>
              {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExtracting ? "Extracting..." : "Create Snapshot"}
            </Button>
            <SnapshotLoader onLoad={handleLoadSnapshot} label="Load Existing" />
            {result && (
              <Button variant="outline" onClick={handleSaveSnapshot}>
                <Save className="h-4 w-4" />
                Save Snapshot
              </Button>
            )}
          </div>

          {isExtracting && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{progress}</p>
              <Progress value={undefined} className="animate-pulse" />
            </div>
          )}
        </CardContent>
      </Card>

      <LogPanel logs={logs} />

      {result && <BundleWarning result={result} />}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Snapshot Summary</CardTitle>
            <CardDescription>
              Extracted at: {result.extractedAt} | Tenant: {result.tenantUrl}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3">
                <Package className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-xl font-bold">{result.packages.length}</p>
                  <p className="text-xs text-muted-foreground">Packages</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Workflow className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-xl font-bold">{result.allFlows.length}</p>
                  <p className="text-xs text-muted-foreground">Flows</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Database className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-xl font-bold">{result.allValueMappings.length}</p>
                  <p className="text-xs text-muted-foreground">Value Mappings</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Activity className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-xl font-bold">{result.runtimeArtifacts.length}</p>
                  <p className="text-xs text-muted-foreground">Runtime Artifacts</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {result.runtimeArtifacts.length > 0 && (
                <>
                  <Badge variant="success">
                    {result.runtimeArtifacts.filter((r) => r.status === "STARTED").length} Deployed
                  </Badge>
                  <Badge variant="destructive">
                    {result.runtimeArtifacts.filter((r) => r.status === "ERROR").length} Errors
                  </Badge>
                </>
              )}
              <Badge variant="secondary">
                {result.allFlows.filter((f) => f.bundleParsed).length} Bundles Parsed
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
