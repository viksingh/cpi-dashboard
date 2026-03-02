"use client";

import { useMemo } from "react";
import { useExtractionStore } from "@/stores/extraction-store";
import { useCpiExtract } from "@/hooks/use-cpi-extract";
import { ConnectionForm } from "@/components/shared/connection-form";
import { DataTable } from "@/components/shared/data-table";
import { LogPanel } from "@/components/shared/log-panel";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Loader2, Package, Workflow, Database, Activity } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { exportJson } from "@/exporters/json-exporter";
import { exportCsv } from "@/exporters/csv-exporter";
import { exportExcel } from "@/exporters/excel-exporter";
import type { ExtractionResult, IntegrationPackage, IntegrationFlow, ValueMapping, RuntimeArtifact, ConfigRow } from "@/types/cpi";

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
  const { options, setOptions, result, isExtracting, progress, logs } = useExtractionStore();
  const { extract } = useCpiExtract();
  const { setResult } = useExtractionStore();

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

  const configColumns: ColumnDef<ConfigRow, unknown>[] = [
    { accessorKey: "artifactId", header: "Artifact ID" },
    { accessorKey: "artifactName", header: "Artifact Name" },
    { accessorKey: "parameterKey", header: "Parameter Key" },
    { accessorKey: "parameterValue", header: "Parameter Value" },
    { accessorKey: "dataType", header: "Data Type" },
  ];

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

  const handleLoadSnapshot = (data: ExtractionResult) => {
    setResult(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Extractor</h1>
        <p className="text-muted-foreground">Extract packages, flows, configurations, and runtime data from SAP CPI</p>
      </div>

      <ConnectionForm />

      {/* Extraction Options */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Extraction Options</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { key: "extractPackages" as const, label: "Packages" },
              { key: "extractFlows" as const, label: "Flows" },
              { key: "extractValueMappings" as const, label: "Value Mappings" },
              { key: "extractConfigurations" as const, label: "Configurations" },
              { key: "extractRuntime" as const, label: "Runtime Status" },
              { key: "extractIflowBundles" as const, label: "iFlow Bundles (deep analysis)" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={options[key]}
                  onCheckedChange={(v) => setOptions({ [key]: !!v })}
                />
                <Label htmlFor={key}>{label}</Label>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={extract} disabled={isExtracting}>
              {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExtracting ? "Extracting..." : "Extract"}
            </Button>
            <SnapshotLoader onLoad={handleLoadSnapshot} />
          </div>
          {isExtracting && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground">{progress}</p>
              <Progress value={undefined} className="animate-pulse" />
            </div>
          )}
        </CardContent>
      </Card>

      <LogPanel logs={logs} />

      {/* Results */}
      {result && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
