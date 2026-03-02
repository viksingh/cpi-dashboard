"use client";

import { useState, useMemo } from "react";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/cert-reference-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { ExtractionResult } from "@/types/cpi";
import type { CertReferenceResult, CertReference } from "@/types/cert-expiry";

const columns: ColumnDef<CertReference, unknown>[] = [
  { accessorKey: "alias", header: "Certificate Alias" },
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  { accessorKey: "adapterType", header: "Adapter" },
  { accessorKey: "propertyKey", header: "Property Key" },
  {
    accessorKey: "runtimeStatus", header: "Status",
    cell: ({ row }) => {
      const s = row.original.runtimeStatus;
      const v = s === "STARTED" ? "success" : s === "ERROR" ? "destructive" : "secondary";
      return <Badge variant={v}>{s || "N/A"}</Badge>;
    },
  },
];

export default function CertExpiryPage() {
  const [result, setResult] = useState<CertReferenceResult | null>(null);
  const handleLoad = (data: ExtractionResult) => setResult(analyzeFromSnapshot(data));

  const groupedByAlias = useMemo(() => {
    if (!result) return [];
    const groups: Record<string, CertReference[]> = {};
    for (const r of result.references) {
      if (!groups[r.alias]) groups[r.alias] = [];
      groups[r.alias].push(r);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel([{
      name: "Certificate References",
      headers: ["Alias", "iFlow", "Package", "Adapter", "Property Key", "Status"],
      rows: result.references.map((r) => [
        r.alias, r.flowName, r.packageName, r.adapterType, r.propertyKey, r.runtimeStatus,
      ]),
    }], "cpi-cert-references.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Certificate Expiry Monitor</h1>
        <p className="text-muted-foreground">Inventory all certificate and keystore references across iFlows</p>
      </div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Load Snapshot</CardTitle>
        <CardDescription>Load a snapshot with parsed bundles for certificate reference scanning</CardDescription></CardHeader>
        <CardContent><SnapshotLoader onLoad={handleLoad} label="Load Snapshot for Analysis" /></CardContent></Card>
      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.totalReferences}</p><p className="text-xs text-muted-foreground">Total References</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.uniqueAliases}</p><p className="text-xs text-muted-foreground">Unique Aliases</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.flowsWithCerts}</p><p className="text-xs text-muted-foreground">Flows Using Certs</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.flowsScanned}</p><p className="text-xs text-muted-foreground">Flows Scanned</p></CardContent></Card>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.aliasCounts).sort(([, a], [, b]) => b - a).map(([alias, count]) => (
              <Badge key={alias} variant="outline">{alias}: {count}</Badge>
            ))}
          </div>
          <ExportToolbar onExportExcel={handleExportExcel} onExportJson={() => exportGenericJson(result, "cpi-cert-references.json")} />
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({result.totalReferences})</TabsTrigger>
              <TabsTrigger value="alias">By Alias ({groupedByAlias.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all"><DataTable columns={columns} data={result.references} searchPlaceholder="Search certificates..." /></TabsContent>
            <TabsContent value="alias">
              <div className="space-y-6">{groupedByAlias.map(([alias, items]) => (
                <div key={alias}><h3 className="text-lg font-semibold mb-2">{alias} ({items.length} references)</h3>
                  <DataTable columns={columns} data={items} searchPlaceholder={`Search ${alias}...`} /></div>
              ))}</div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
