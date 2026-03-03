"use client";

import { useMemo } from "react";
import { useExtractionStore } from "@/stores/extraction-store";
import { useStoreHydrated } from "@/hooks/use-store-hydration";
import { useFlowIdFilter } from "@/hooks/use-flow-id-filter";
import { NoSnapshotPlaceholder } from "@/components/shared/no-snapshot-placeholder";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/pattern-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { PatternResult, PatternClassification } from "@/types/pattern";
import { PatternTypeLabels } from "@/types/pattern";

const patternColors: Record<string, string> = {
  SYNC_REQUEST_REPLY: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ASYNC_FIRE_FORGET: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  STORE_FORWARD: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  PUBLISH_SUBSCRIBE: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  CONTENT_ROUTING: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  ORCHESTRATION: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  POLLING: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  BATCH: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  UNKNOWN: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const columns: ColumnDef<PatternClassification, unknown>[] = [
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  {
    accessorKey: "pattern", header: "Pattern",
    cell: ({ row }) => (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${patternColors[row.original.pattern] || ""}`}>
        {PatternTypeLabels[row.original.pattern]}
      </span>
    ),
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
    accessorKey: "reasons", header: "Reasons",
    cell: ({ row }) => (
      <span className="max-w-xs truncate block text-xs" title={row.original.reasons.join("; ")}>
        {row.original.reasons.join("; ")}
      </span>
    ),
  },
  {
    accessorKey: "adapterTypes", header: "Adapters",
    cell: ({ row }) => row.original.adapterTypes.join(", ") || "-",
  },
  { accessorKey: "routeCount", header: "Routes" },
  {
    accessorKey: "runtimeStatus", header: "Status",
    cell: ({ row }) => {
      const s = row.original.runtimeStatus;
      const v = s === "STARTED" ? "success" : s === "ERROR" ? "destructive" : "secondary";
      return <Badge variant={v}>{s || "N/A"}</Badge>;
    },
  },
];

export default function PatternsPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const initialFilter = useFlowIdFilter(extractionResult);

  const result = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);

  const lowConfidence = useMemo(
    () => result?.classifications.filter((c) => c.confidence < 60) || [],
    [result]
  );

  const groupedByPattern = useMemo(() => {
    if (!result) return [];
    const groups: Record<string, PatternClassification[]> = {};
    for (const c of result.classifications) {
      const label = PatternTypeLabels[c.pattern];
      if (!groups[label]) groups[label] = [];
      groups[label].push(c);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel(
      [{
        name: "Patterns",
        headers: ["iFlow", "Package", "Pattern", "Confidence", "Reasons", "Adapters", "Routes", "Status"],
        rows: result.classifications.map((c) => [
          c.flowName, c.packageName, PatternTypeLabels[c.pattern],
          c.confidence, c.reasons.join("; "), c.adapterTypes.join(", "),
          c.routeCount, c.runtimeStatus,
        ]),
      }],
      "cpi-patterns.xlsx"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integration Pattern Classifier</h1>
        <p className="text-muted-foreground">Classify iFlows by integration pattern for migration planning</p>
      </div>

      {hydrated && !result && <NoSnapshotPlaceholder />}

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.totalClassified}</p>
                <p className="text-xs text-muted-foreground">Classified</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.uniquePatterns}</p>
                <p className="text-xs text-muted-foreground">Unique Patterns</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{PatternTypeLabels[result.mostCommon]}</p>
                <p className="text-xs text-muted-foreground">Most Common</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-orange-500">{result.lowConfidenceCount}</p>
                <p className="text-xs text-muted-foreground">Low Confidence</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(result.patternCounts)
              .filter(([, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([pattern, count]) => (
                <Badge key={pattern} variant="outline">
                  {PatternTypeLabels[pattern as keyof typeof PatternTypeLabels]}: {count}
                </Badge>
              ))}
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(result, "cpi-patterns.json")}
          />

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({result.totalClassified})</TabsTrigger>
              <TabsTrigger value="grouped">By Pattern</TabsTrigger>
              <TabsTrigger value="low">Low Confidence ({lowConfidence.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <DataTable columns={columns} data={result.classifications} searchPlaceholder="Search flows..." initialFilter={initialFilter} />
            </TabsContent>
            <TabsContent value="grouped">
              <div className="space-y-6">
                {groupedByPattern.map(([pattern, items]) => (
                  <div key={pattern}>
                    <h3 className="text-lg font-semibold mb-2">{pattern} ({items.length})</h3>
                    <DataTable columns={columns} data={items} searchPlaceholder={`Search ${pattern}...`} />
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="low">
              <DataTable columns={columns} data={lowConfidence} searchPlaceholder="Search low confidence..." />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
