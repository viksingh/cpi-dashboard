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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, Package, Workflow, Database, Activity, Save, Info, ChevronDown, ChevronUp, AlertTriangle, Filter, CalendarDays, RefreshCw } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { exportJson } from "@/exporters/json-exporter";
import { exportCsv } from "@/exporters/csv-exporter";
import { exportExcel } from "@/exporters/excel-exporter";
import { applyDateFilter, parseDate } from "@/lib/date-filter";
import { FilterMode, FilterModeLabels } from "@/types/cpi";
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

function formatTimestamp(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const date = parseDate(value as string | number);
  if (!date) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const dateCell = (key: string) => ({
  cell: ({ row }: { row: { getValue: (k: string) => unknown } }) => formatTimestamp(row.getValue(key)),
});

const packageColumns: ColumnDef<IntegrationPackage, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "version", header: "Version" },
  { accessorKey: "vendor", header: "Vendor" },
  { accessorKey: "modifiedBy", header: "Modified By" },
  { accessorKey: "modifiedDate", header: "Modified Date", ...dateCell("modifiedDate") },
];

const flowColumns: ColumnDef<IntegrationFlow, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "packageId", header: "Package" },
  { accessorKey: "version", header: "Version" },
  { accessorKey: "sender", header: "Sender" },
  { accessorKey: "receiver", header: "Receiver" },
  { accessorKey: "modifiedBy", header: "Modified By" },
  { accessorKey: "modifiedAt", header: "Modified At", ...dateCell("modifiedAt") },
];

const vmColumns: ColumnDef<ValueMapping, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "packageId", header: "Package" },
  { accessorKey: "version", header: "Version" },
  { accessorKey: "modifiedBy", header: "Modified By" },
  { accessorKey: "modifiedAt", header: "Modified At", ...dateCell("modifiedAt") },
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
  { accessorKey: "deployedOn", header: "Deployed On", ...dateCell("deployedOn") },
];

export default function ExtractorPage() {
  const { options, setOptions, result, isExtracting, progress, logs, setResult, setSnapshotMeta } = useExtractionStore();
  const { extract, refresh } = useCpiExtract();
  const [showHelp, setShowHelp] = useState(false);

  // Apply client-side date filter if enabled
  const filteredResult = useMemo(() => {
    if (!result) return null;
    if (!options.dateFilterEnabled || !options.sinceDate) return result;
    return applyDateFilter(result, options.sinceDate, options.dateFilterMode);
  }, [result, options.dateFilterEnabled, options.sinceDate, options.dateFilterMode]);

  const displayResult = filteredResult;

  const configRows = useMemo<ConfigRow[]>(() => {
    if (!displayResult) return [];
    return displayResult.allFlows.flatMap((flow) =>
      (flow.configurations || []).map((cfg) => ({
        artifactId: flow.id,
        artifactName: flow.name,
        parameterKey: cfg.parameterKey,
        parameterValue: cfg.parameterValue,
        dataType: cfg.dataType,
      }))
    );
  }, [displayResult]);

  const bundleStats = useMemo(() => {
    if (!displayResult) return { parsed: 0, total: 0 };
    const total = displayResult.allFlows.length;
    const parsed = displayResult.allFlows.filter((f) => f.iflowContent).length;
    return { parsed, total };
  }, [displayResult]);

  const runtimeStats = useMemo(() => {
    if (!displayResult) return { deployed: 0, errors: 0 };
    return {
      deployed: displayResult.runtimeArtifacts.filter((r) => r.status === "STARTED").length,
      errors: displayResult.runtimeArtifacts.filter((r) => r.status === "ERROR").length,
    };
  }, [displayResult]);

  const isFiltered = options.dateFilterEnabled && !!options.sinceDate && !!result;

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
    if (displayResult) exportJson(displayResult, isFiltered ? "cpi-snapshot-filtered" : "cpi-snapshot");
  };

  const handleApplyFilterToStore = () => {
    if (filteredResult && isFiltered) {
      setResult(filteredResult);
      setSnapshotMeta(
        `Filtered: ${FilterModeLabels[options.dateFilterMode]} ${options.sinceDate}`
      );
      setOptions({ dateFilterEnabled: false, sinceDate: null });
    }
  };

  const handleExportJson = () => {
    if (displayResult) exportJson(displayResult, "cpi-extract");
  };

  const handleExportExcel = async () => {
    if (!displayResult) return;
    await exportExcel(
      [
        {
          name: "Packages",
          headers: ["ID", "Name", "Version", "Vendor", "Mode", "Modified By", "Modified Date"],
          rows: displayResult.packages.map((p) => [p.id, p.name, p.version, p.vendor || "", p.mode || "", p.modifiedBy || "", p.modifiedDate || ""]),
        },
        {
          name: "Flows",
          headers: ["ID", "Name", "Package", "Version", "Sender", "Receiver", "Modified By", "Modified At"],
          rows: displayResult.allFlows.map((f) => [f.id, f.name, f.packageId, f.version, f.sender, f.receiver, f.modifiedBy, f.modifiedAt]),
        },
        {
          name: "Value Mappings",
          headers: ["ID", "Name", "Package", "Version", "Modified By"],
          rows: displayResult.allValueMappings.map((v) => [v.id, v.name, v.packageId, v.version, v.modifiedBy || ""]),
        },
        {
          name: "Runtime",
          headers: ["ID", "Name", "Version", "Type", "Status", "Deployed By"],
          rows: displayResult.runtimeArtifacts.map((r) => [r.id, r.name, r.version, r.type, r.status, r.deployedBy]),
        },
      ],
      "cpi-extract.xlsx"
    );
  };

  const handleExportCsv = () => {
    if (!displayResult) return;
    const rows = displayResult.allFlows.map((f) => ({
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

          {/* Date Filter */}
          <div className="mt-4 rounded-md border p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="dateFilterEnabled"
                checked={options.dateFilterEnabled}
                onCheckedChange={(v) => setOptions({ dateFilterEnabled: !!v })}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="dateFilterEnabled" className="flex items-center gap-1 cursor-pointer">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  Date Filter
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Filter artifacts by date. Applied client-side after extraction or snapshot load. Use &quot;Existed at&quot; to see what your CPI looked like at a point in time, or &quot;Modified since&quot; to see recent changes.
                    </TooltipContent>
                  </Tooltip>
                </Label>
              </div>
            </div>

            {options.dateFilterEnabled && (
              <div className="flex flex-wrap items-end gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Mode</Label>
                  <Select
                    value={options.dateFilterMode}
                    onValueChange={(v) => setOptions({ dateFilterMode: v as FilterMode })}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FilterModeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input
                    type="date"
                    value={options.sinceDate ?? ""}
                    onChange={(e) => setOptions({ sinceDate: e.target.value || null })}
                    className="w-[180px]"
                  />
                </div>
                {isFiltered && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Filter className="h-3 w-3" />
                      {displayResult?.allFlows.length}/{result?.allFlows.length} flows
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={handleApplyFilterToStore}>
                          Apply to all tools
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Replace the stored snapshot with filtered data. All analysis tools will use the filtered dataset.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            <Button onClick={handleExtract} disabled={isExtracting}>
              {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExtracting ? "Extracting..." : "Extract"}
            </Button>
            <SnapshotLoader label="Load Snapshot" />
            {result && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={refresh} disabled={isExtracting}>
                    {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh Snapshot
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  Fetch missing data from CPI API: downloads bundles for flows without bundle data, refreshes runtime status, and fetches missing configurations. Requires CPI connection.
                </TooltipContent>
              </Tooltip>
            )}
            {result && (
              <Button variant="outline" onClick={handleSaveSnapshot}>
                <Save className="h-4 w-4" />
                {isFiltered ? "Save Filtered Snapshot" : "Save Snapshot"}
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
      {displayResult && <BundleWarning result={displayResult} />}

      {/* Results */}
      {displayResult && (
        <>
          {/* Filter indicator */}
          {isFiltered && (
            <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="flex items-center gap-2 p-3 text-sm">
                <Filter className="h-4 w-4 text-amber-600" />
                <span>
                  Showing filtered data: <strong>{FilterModeLabels[options.dateFilterMode]}</strong>{" "}
                  <strong>{options.sinceDate}</strong>
                  {" "}({displayResult.allFlows.length} of {result?.allFlows.length} flows)
                </span>
              </CardContent>
            </Card>
          )}

          {/* Enhanced summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Package className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{displayResult.packages.length}</p>
                  <p className="text-xs text-muted-foreground">Packages</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Workflow className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{displayResult.allFlows.length}</p>
                  <p className="text-xs text-muted-foreground">Flows</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Database className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{displayResult.allValueMappings.length}</p>
                  <p className="text-xs text-muted-foreground">Value Mappings</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Activity className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{displayResult.runtimeArtifacts.length}</p>
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
            {displayResult.extractedAt && (
              <Badge variant="outline">Extracted: {new Date(displayResult.extractedAt).toLocaleString()}</Badge>
            )}
            {displayResult.tenantUrl && (
              <Badge variant="outline">{displayResult.tenantUrl}</Badge>
            )}
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            disabled={!displayResult}
          />

          <Tabs defaultValue="packages">
            <TabsList>
              <TabsTrigger value="packages">Packages ({displayResult.packages.length})</TabsTrigger>
              <TabsTrigger value="flows">Flows ({displayResult.allFlows.length})</TabsTrigger>
              <TabsTrigger value="valuemappings">Value Mappings ({displayResult.allValueMappings.length})</TabsTrigger>
              <TabsTrigger value="configs">Configurations ({configRows.length})</TabsTrigger>
              <TabsTrigger value="runtime">Runtime ({displayResult.runtimeArtifacts.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="packages">
              <DataTable columns={packageColumns} data={displayResult.packages} searchPlaceholder="Search packages..." />
            </TabsContent>
            <TabsContent value="flows">
              <DataTable columns={flowColumns} data={displayResult.allFlows} searchPlaceholder="Search flows..." />
            </TabsContent>
            <TabsContent value="valuemappings">
              <DataTable columns={vmColumns} data={displayResult.allValueMappings} searchPlaceholder="Search value mappings..." />
            </TabsContent>
            <TabsContent value="configs">
              <DataTable columns={configColumns} data={configRows} searchPlaceholder="Search configurations..." />
            </TabsContent>
            <TabsContent value="runtime">
              <DataTable columns={runtimeColumns} data={displayResult.runtimeArtifacts} searchPlaceholder="Search runtime..." />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
