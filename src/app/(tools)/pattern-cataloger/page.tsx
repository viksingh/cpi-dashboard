"use client";

import { useMemo } from "react";
import { useExtractionStore } from "@/stores/extraction-store";
import { useStoreHydrated } from "@/hooks/use-store-hydration";
import { NoSnapshotPlaceholder } from "@/components/shared/no-snapshot-placeholder";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/pattern-catalog-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { CatalogEntry } from "@/types/pattern-catalog";
import { CatalogPatternLabels } from "@/types/pattern-catalog";

const columns: ColumnDef<CatalogEntry, unknown>[] = [
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  {
    accessorKey: "pattern", header: "Pattern",
    cell: ({ row }) => <Badge variant="outline">{CatalogPatternLabels[row.original.pattern]}</Badge>,
  },
  {
    accessorKey: "confidence", header: "Confidence",
    cell: ({ row }) => {
      const c = row.original.confidence;
      const color = c >= 80 ? "text-green-600" : c >= 60 ? "text-yellow-600" : "text-red-600";
      return <span className={`font-medium ${color}`}>{c}%</span>;
    },
  },
  {
    accessorKey: "s4Recommendation", header: "S/4 Recommendation",
    cell: ({ row }) => <span className="max-w-sm truncate block text-xs" title={row.original.s4Recommendation}>{row.original.s4Recommendation}</span>,
  },
  {
    accessorKey: "adapterTypes", header: "Adapters",
    cell: ({ row }) => row.original.adapterTypes.join(", ") || "-",
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

export default function PatternCatalogerPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const result = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel([
      {
        name: "Pattern Catalog",
        headers: ["iFlow", "Package", "Pattern", "Confidence", "S/4 Recommendation", "Adapters", "Status"],
        rows: result.entries.map((e) => [
          e.flowName, e.packageName, CatalogPatternLabels[e.pattern], e.confidence,
          e.s4Recommendation, e.adapterTypes.join(", "), e.runtimeStatus,
        ]),
      },
      {
        name: "S4 Recommendations",
        headers: ["Pattern", "Count", "S/4 Migration Recommendation"],
        rows: result.s4Recommendations.map((r) => [CatalogPatternLabels[r.pattern], r.count, r.recommendation]),
      },
    ], "cpi-pattern-catalog.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integration Pattern Cataloger</h1>
        <p className="text-muted-foreground">Classify patterns with S/4HANA migration recommendations</p>
      </div>
      {hydrated && !result && <NoSnapshotPlaceholder />}
      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.totalCataloged}</p><p className="text-xs text-muted-foreground">Cataloged</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.uniquePatterns}</p><p className="text-xs text-muted-foreground">Unique Patterns</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.s4Recommendations.length}</p><p className="text-xs text-muted-foreground">S/4 Recommendations</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.entries.filter((e) => e.confidence < 60).length}</p><p className="text-xs text-muted-foreground">Low Confidence</p></CardContent></Card>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.patternCounts).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).map(([p, count]) => (
              <Badge key={p} variant="outline">{CatalogPatternLabels[p as keyof typeof CatalogPatternLabels]}: {count}</Badge>
            ))}
          </div>
          <ExportToolbar onExportExcel={handleExportExcel} onExportJson={() => exportGenericJson(result, "cpi-pattern-catalog.json")} />
          <Tabs defaultValue="catalog">
            <TabsList>
              <TabsTrigger value="catalog">Catalog ({result.totalCataloged})</TabsTrigger>
              <TabsTrigger value="recommendations">S/4 Recommendations</TabsTrigger>
            </TabsList>
            <TabsContent value="catalog"><DataTable columns={columns} data={result.entries} searchPlaceholder="Search patterns..." /></TabsContent>
            <TabsContent value="recommendations">
              <div className="space-y-4">{result.s4Recommendations.map((r) => (
                <Card key={r.pattern}><CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{CatalogPatternLabels[r.pattern]}</Badge>
                    <Badge variant="secondary">{r.count} flows</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.recommendation}</p>
                </CardContent></Card>
              ))}</div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
