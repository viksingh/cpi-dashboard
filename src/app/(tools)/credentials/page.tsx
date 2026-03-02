"use client";

import { useState, useMemo } from "react";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/credential-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { ExtractionResult } from "@/types/cpi";
import type { SecurityAuditResult, CredentialInfo } from "@/types/credential";
import { CredentialTypeLabels } from "@/types/credential";

const columns: ColumnDef<CredentialInfo, unknown>[] = [
  { accessorKey: "name", header: "Credential Name" },
  {
    accessorKey: "type", header: "Type",
    cell: ({ row }) => <Badge variant="outline">{CredentialTypeLabels[row.original.type]}</Badge>,
  },
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  { accessorKey: "adapterType", header: "Adapter" },
  { accessorKey: "source", header: "Source" },
  { accessorKey: "propertyKey", header: "Property Key" },
  {
    accessorKey: "eccRelated", header: "ECC",
    cell: ({ row }) =>
      row.original.eccRelated ? (
        <Badge variant="destructive">ECC</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "runtimeStatus", header: "Status",
    cell: ({ row }) => {
      const s = row.original.runtimeStatus;
      const v = s === "STARTED" ? "success" : s === "ERROR" ? "destructive" : "secondary";
      return <Badge variant={v}>{s || "N/A"}</Badge>;
    },
  },
];

export default function CredentialsPage() {
  const [result, setResult] = useState<SecurityAuditResult | null>(null);

  const handleLoad = (data: ExtractionResult) => {
    setResult(analyzeFromSnapshot(data));
  };

  const eccCredentials = useMemo(
    () => result?.credentials.filter((c) => c.eccRelated) || [],
    [result]
  );

  const groupedByType = useMemo(() => {
    if (!result) return [];
    const groups: Record<string, CredentialInfo[]> = {};
    for (const c of result.credentials) {
      const label = CredentialTypeLabels[c.type];
      if (!groups[label]) groups[label] = [];
      groups[label].push(c);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel(
      [
        {
          name: "Credentials",
          headers: ["Name", "Type", "iFlow", "Package", "Adapter", "Source", "Property Key", "ECC", "Status"],
          rows: result.credentials.map((c) => [
            c.name, CredentialTypeLabels[c.type], c.flowName, c.packageName,
            c.adapterType, c.source, c.propertyKey,
            c.eccRelated ? "Yes" : "", c.runtimeStatus,
          ]),
        },
        {
          name: "Shared Credentials",
          headers: ["Name", "Type", "Flow Count", "Flows"],
          rows: result.sharedCredentials.map((s) => [
            s.name, CredentialTypeLabels[s.type], s.flowCount, s.flowNames.join(", "),
          ]),
        },
      ],
      "cpi-credentials.xlsx"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Credential & Security Auditor</h1>
        <p className="text-muted-foreground">Inventory all security artifacts referenced by iFlows</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Load Snapshot</CardTitle>
          <CardDescription>Load a snapshot with parsed bundles for security audit</CardDescription>
        </CardHeader>
        <CardContent>
          <SnapshotLoader onLoad={handleLoad} label="Load Snapshot for Analysis" />
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.totalCredentials}</p>
                <p className="text-xs text-muted-foreground">Total Credentials</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-500">{result.eccRelatedCount}</p>
                <p className="text-xs text-muted-foreground">ECC-Related</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-orange-500">{result.sharedCredentials.length}</p>
                <p className="text-xs text-muted-foreground">Shared Across Flows</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{Object.values(result.typeCounts).filter((c) => c > 0).length}</p>
                <p className="text-xs text-muted-foreground">Credential Types</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(result.typeCounts)
              .filter(([, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <Badge key={type} variant="outline">
                  {CredentialTypeLabels[type as keyof typeof CredentialTypeLabels]}: {count}
                </Badge>
              ))}
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(result, "cpi-credentials.json")}
          />

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({result.totalCredentials})</TabsTrigger>
              <TabsTrigger value="ecc">ECC ({eccCredentials.length})</TabsTrigger>
              <TabsTrigger value="type">By Type</TabsTrigger>
              <TabsTrigger value="shared">Shared ({result.sharedCredentials.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <DataTable columns={columns} data={result.credentials} searchPlaceholder="Search credentials..." />
            </TabsContent>
            <TabsContent value="ecc">
              <DataTable columns={columns} data={eccCredentials} searchPlaceholder="Search ECC credentials..." />
            </TabsContent>
            <TabsContent value="type">
              <div className="space-y-6">
                {groupedByType.map(([type, items]) => (
                  <div key={type}>
                    <h3 className="text-lg font-semibold mb-2">{type} ({items.length})</h3>
                    <DataTable columns={columns} data={items} searchPlaceholder={`Search ${type}...`} />
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="shared">
              <div className="space-y-4">
                {result.sharedCredentials.map((s) => (
                  <Card key={`${s.name}-${s.type}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold">{s.name}</span>
                        <Badge variant="outline">{CredentialTypeLabels[s.type]}</Badge>
                        <Badge variant="secondary">{s.flowCount} flows</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{s.flowNames.join(", ")}</p>
                    </CardContent>
                  </Card>
                ))}
                {result.sharedCredentials.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">No shared credentials found</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
