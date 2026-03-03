"use client";

import { useMemo, useState } from "react";
import { useExtractionStore } from "@/stores/extraction-store";
import { useCpiExtract } from "@/hooks/use-cpi-extract";
import { ConnectionForm } from "@/components/shared/connection-form";
import { DataTable } from "@/components/shared/data-table";
import { LogPanel } from "@/components/shared/log-panel";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { BundleWarning } from "@/components/shared/bundle-warning";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Loader2, Package, Workflow, Database, Activity, Save, Info, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { exportJson } from "@/exporters/json-exporter";
import { exportCsv } from "@/exporters/csv-exporter";
import { exportExcel } from "@/exporters/excel-exporter";
import type { ExtractionResult, IntegrationPackage, IntegrationFlow, ValueMapping, RuntimeArtifact, ConfigRow } from "@/types/cpi";

const extractionOptions = [
  {
    key: "extractPackages" as const,
    label: "Packages",
    description: "Fetches integration packages via /IntegrationPackages. Used by all 18 analyzers.",
    critical: false,
  },
  {
    key: "extractFlows" as const,
    label: "Flows",
    description: "Fetches integration flows per package via /IntegrationDesigntimeArtifacts. Used by all 18 analyzers.",
    critical: false,
  },
  {
    key: "extractValueMappings" as const,
    label: "Value Mappings",
    description: "Fetches value mapping artifacts per package. Used by the Snapshot Diff engine.",
    critical: false,
  },
  {
    key: "extractConfigurations" as const,
    label: "Configurations",
    description: "Fetches externalized parameters per flow via /$links/Configurations. Used by Param Auditor, Number Ranges, Req Doc Gen, and Dependencies.",
    critical: false,
  },
  {
    key: "extractRuntime" as const,
    label: "Runtime Status",
    description: "Fetches runtime artifact status via /IntegrationRuntimeArtifacts. Used by 13 analyzers for deploy status and error info.",
    critical: false,
  },
  {
    key: "extractIflowBundles" as const,
    label: "iFlow Bundles (deep analysis)",
    description: "Downloads and parses each iFlow ZIP bundle to extract adapters, routes, scripts, mappings, and endpoints. Used by 16 of 18 analyzers.",
    critical: true,
  },
];

const packageColumns: ColumnDef<IntegrationPackage, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "version", header: "Version" },
  { accessorKey: "vendor", header: "Vendor" },
  { accessorKey: "modifiedBy", header: "Modified By" },
  { accessorKey: "modifiedDate", header: "Modified Date" },
];

const flowColumns: ColumnDef<IntegrationFlow, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "packageId", header: "Package" },
  { accessorKey: "version", header: "Version" },
  { accessorKey: "sender", header: "Sender" },
  { accessorKey: "receiver", header: "Receiver" },
  { accessorKey: "modifiedBy", header: "Modified By" },
  { accessorKey: "modifiedAt", header: "Modified At" },
];

const vmColumns: ColumnDef<ValueMapping, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "packageId", header: "Package" },
  { accessorKey: "version", header: "Version" },
  { accessorKey: "modifiedBy", header: "Modified By" },
];

const runtimeColumns: ColumnDef<RuntimeArtifact, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "version", header: "Version" },
  { accessorKey: "type", header: "Type" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const variant = status === "STARTED" ? "success" : status === "ERROR" ? "destructive" : "secondary";
      return <Badge variant={variant}>{status}</Badge>;
    },
  },
  { accessorKey: "deployedBy", header: "Deployed By" },
];

export default function ExtractorPage() {
  const { options, setOptions, result, isExtracting, progress, logs, setResult, setSnapshotMeta } = useExtractionStore();
  const { extract } = useCpiExtract();
  const [showHelp, setShowHelp] = useState(false);

  const configRows = useMemo<ConfigRow[]>(() => {
    if (!result) return [];
    return result.allFlows.flatMap((flow) =>
      (flow.configurations || []).map((cfg) => ({
        artifactId: flow.id,
        artifactName: flow.name,
        parameterKey: cfg.parameterKey,
        parameterValue: cfg.parameterValue,
        dataType: cfg.dataType,
      }))
    );
  }, [result]);

  const bundleStats = useMemo(() => {
    if (!result) return { parsed: 0, total: 0 };
    const total = result.allFlows.length;
    const parsed = result.allFlows.filter((f) => f.bundleParsed && f.iflowContent).length;
    return { parsed, total };
  }, [result]);

  const runtimeStats = useMemo(() => {
    if (!result) return { deployed: 0, errors: 0 };
    return {
      deployed: result.runtimeArtifacts.filter((r) => r.status === "STARTED").length,
      errors: result.runtimeArtifacts.filter((r) => r.status === "ERROR").length,
    };
  }, [result]);

  const configColumns: ColumnDef<ConfigRow, unknown>[] = [
    { accessorKey: "artifactId", header: "Artifact ID" },
    { accessorKey: "artifactName", header: "Artifact Name" },
    { accessorKey: "parameterKey", header: "Parameter Key" },
    { accessorKey: "parameterValue", header: "Parameter Value" },
    { accessorKey: "dataType", header: "Data Type" },
  ];

  const handleExtract = async () => {
    await extract();
    setSnapshotMeta("Live extraction");
  };

  const handleSaveSnapshot = () => {
    if (result) exportJson(result, "cpi-snapshot");
  };

  const handleExportJson = () => {
    if (result) exportJson(result, "cpi-extract");
  };

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel(
      [
        {
          name: "Packages",
          headers: ["ID", "Name", "Version", "Vendor", "Mode", "Modified By", "Modified Date"],
          rows: result.packages.map((p) => [p.id, p.name, p.version, p.vendor || "", p.mode || "", p.modifiedBy || "", p.modifiedDate || ""]),
        },
        {
          name: "Flows",
          headers: ["ID", "Name", "Package", "Version", "Sender", "Receiver", "Modified By", "Modified At"],
          rows: result.allFlows.map((f) => [f.id, f.name, f.packageId, f.version, f.sender, f.receiver, f.modifiedBy, f.modifiedAt]),
        },
        {
          name: "Value Mappings",
          headers: ["ID", "Name", "Package", "Version", "Modified By"],
          rows: result.allValueMappings.map((v) => [v.id, v.name, v.packageId, v.version, v.modifiedBy || ""]),
        },
        {
          name: "Runtime",
          headers: ["ID", "Name", "Version", "Type", "Status", "Deployed By"],
          rows: result.runtimeArtifacts.map((r) => [r.id, r.name, r.version, r.type, r.status, r.deployedBy]),
        },
      ],
      "cpi-extract.xlsx"
    );
  };

  const handleExportCsv = () => {
    if (!result) return;
    const rows = result.allFlows.map((f) => ({
      id: f.id, name: f.name, packageId: f.packageId, version: f.version,
      sender: f.sender, receiver: f.receiver, modifiedBy: f.modifiedBy, modifiedAt: f.modifiedAt,
    }));
    exportCsv(rows, "cpi-flows.csv");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Extractor & Snapshot</h1>
        <p className="text-muted-foreground">Extract data from SAP CPI, load or save JSON snapshots for offline analysis</p>
      </div>

      <ConnectionForm />

      {/* Extraction Options */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Extraction Options</CardTitle>
          <CardDescription>Select what data to extract. All analysis tools read from the shared snapshot.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extractionOptions.map(({ key, label, description, critical }) => (
              <div key={key} className="flex items-start gap-2">
                <Checkbox
                  id={key}
                  checked={options[key]}
                  onCheckedChange={(v) => setOptions({ [key]: !!v })}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor={key} className="flex items-center gap-1 cursor-pointer">
                    {label}
                    {critical && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {description}
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            <Button onClick={handleExtract} disabled={isExtracting}>
              {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExtracting ? "Extracting..." : "Extract"}
            </Button>
            <SnapshotLoader label="Load Snapshot" />
            {result && (
              <Button variant="outline" onClick={handleSaveSnapshot}>
                <Save className="h-4 w-4" />
                Save Snapshot
              </Button>
            )}
          </div>

          {isExtracting && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground">{progress}</p>
              <Progress value={undefined} className="animate-pulse" />
            </div>
          )}

          {/* Collapsible help section */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="mt-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showHelp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Data requirements per analyzer
          </button>
          {showHelp && (
            <div className="mt-2 rounded-md border p-3 text-xs text-muted-foreground space-y-2">
              <p><strong>All analyzers</strong> need Packages + Flows.</p>
              <p><strong>16 of 18</strong> analyzers need iFlow Bundles (adapters, routes, scripts, endpoints).</p>
              <p><strong>13 analyzers</strong> use Runtime Status for deploy state and error info.</p>
              <p><strong>4 analyzers</strong> (Param Auditor, Number Ranges, Req Doc Gen, Dependencies) use Configurations.</p>
              <p><strong>Snapshot Diff</strong> is the only tool that uses Value Mappings.</p>
              <p>For best results, enable all options. iFlow Bundles is the most important for analysis.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <LogPanel logs={logs} />

      {/* Bundle warning + Snapshot summary */}
      {result && <BundleWarning result={result} />}

      {/* Results */}
      {result && (
        <>
          {/* Enhanced summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Package className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{result.packages.length}</p>
                  <p className="text-xs text-muted-foreground">Packages</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Workflow className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{result.allFlows.length}</p>
                  <p className="text-xs text-muted-foreground">Flows</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Database className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{result.allValueMappings.length}</p>
                  <p className="text-xs text-muted-foreground">Value Mappings</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Activity className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{result.runtimeArtifacts.length}</p>
                  <p className="text-xs text-muted-foreground">Runtime Artifacts</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className={`text-2xl font-bold ${bundleStats.parsed === 0 && bundleStats.total > 0 ? "text-red-500" : ""}`}>
                  {bundleStats.parsed}/{bundleStats.total}
                </p>
                <p className="text-xs text-muted-foreground">Bundles Parsed</p>
              </CardContent>
            </Card>
          </div>

          {/* Badge row */}
          <div className="flex flex-wrap gap-2">
            {configRows.length > 0 && (
              <Badge variant="secondary">{configRows.length} Configurations</Badge>
            )}
            {runtimeStats.deployed > 0 && (
              <Badge variant="success">{runtimeStats.deployed} Deployed</Badge>
            )}
            {runtimeStats.errors > 0 && (
              <Badge variant="destructive">{runtimeStats.errors} Errors</Badge>
            )}
            {result.extractedAt && (
              <Badge variant="outline">Extracted: {new Date(result.extractedAt).toLocaleString()}</Badge>
            )}
            {result.tenantUrl && (
              <Badge variant="outline">{result.tenantUrl}</Badge>
            )}
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            disabled={!result}
          />

          <Tabs defaultValue="packages">
            <TabsList>
              <TabsTrigger value="packages">Packages ({result.packages.length})</TabsTrigger>
              <TabsTrigger value="flows">Flows ({result.allFlows.length})</TabsTrigger>
              <TabsTrigger value="valuemappings">Value Mappings ({result.allValueMappings.length})</TabsTrigger>
              <TabsTrigger value="configs">Configurations ({configRows.length})</TabsTrigger>
              <TabsTrigger value="runtime">Runtime ({result.runtimeArtifacts.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="packages">
              <DataTable columns={packageColumns} data={result.packages} searchPlaceholder="Search packages..." />
            </TabsContent>
            <TabsContent value="flows">
              <DataTable columns={flowColumns} data={result.allFlows} searchPlaceholder="Search flows..." />
            </TabsContent>
            <TabsContent value="valuemappings">
              <DataTable columns={vmColumns} data={result.allValueMappings} searchPlaceholder="Search value mappings..." />
            </TabsContent>
            <TabsContent value="configs">
              <DataTable columns={configColumns} data={configRows} searchPlaceholder="Search configurations..." />
            </TabsContent>
            <TabsContent value="runtime">
              <DataTable columns={runtimeColumns} data={result.runtimeArtifacts} searchPlaceholder="Search runtime..." />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
