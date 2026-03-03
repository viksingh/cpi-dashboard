"use client";

import { useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useExtractionStore } from "@/stores/extraction-store";
import { useStoreHydrated } from "@/hooks/use-store-hydration";
import { NoSnapshotPlaceholder } from "@/components/shared/no-snapshot-placeholder";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/normalized-flow-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { NormalizedFlowResult, NormalizedFlow, FlowStep, BrokenLink } from "@/types/normalized-flow";

const chainColumns: ColumnDef<NormalizedFlow, unknown>[] = [
  {
    accessorKey: "normalizedName", header: "Normalized Flow Chain",
    cell: ({ row }) => (
      <span className="max-w-lg block" title={row.original.normalizedName}>
        {row.original.steps.map((s, i) => (
          <span key={s.flowId}>
            {i > 0 && <span className="text-muted-foreground font-bold"> ___ </span>}
            <span className="font-medium">{s.flowName}</span>
          </span>
        ))}
      </span>
    ),
  },
  {
    accessorKey: "length", header: "Chain Length",
    cell: ({ row }) => <Badge variant="outline">{row.original.length} flows</Badge>,
  },
  { accessorKey: "entryFlowName", header: "Entry Point" },
  {
    accessorKey: "linkages", header: "Link Types",
    cell: ({ row }) => {
      const types = [...new Set(row.original.linkages.map((l) => l.linkType))];
      return types.map((t) => <Badge key={t} variant="secondary" className="mr-1">{t}</Badge>);
    },
  },
];

const standaloneColumns: ColumnDef<FlowStep, unknown>[] = [
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  { accessorKey: "flowId", header: "Flow ID" },
];

const brokenColumns: ColumnDef<BrokenLink, unknown>[] = [
  { accessorKey: "address", header: "Queue / Address" },
  {
    accessorKey: "linkType", header: "Type",
    cell: ({ row }) => <Badge variant="outline">{row.original.linkType}</Badge>,
  },
  {
    accessorKey: "producerFlowName", header: "Producer",
    cell: ({ row }) => row.original.producerFlowName || <span className="text-red-500">Missing</span>,
  },
  {
    accessorKey: "consumerFlowName", header: "Consumer",
    cell: ({ row }) => row.original.consumerFlowName || <span className="text-red-500">Missing</span>,
  },
  { accessorKey: "reason", header: "Reason" },
];

export default function NormalizedFlowsPage() {
  return <Suspense><NormalizedFlowsContent /></Suspense>;
}

function NormalizedFlowsContent() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const searchParams = useSearchParams();
  const flowIdParam = searchParams.get("flowId");

  const result = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);

  const initialFilter = useMemo(() => {
    if (!flowIdParam || !extractionResult) return "";
    const flow = extractionResult.allFlows.find((f) => f.id === flowIdParam);
    return flow?.name ?? flowIdParam;
  }, [flowIdParam, extractionResult]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel(
      [
        {
          name: "Chains",
          headers: ["Normalized Name", "Length", "Entry Point", "Link Types", "Steps"],
          rows: result.chains.map((c) => [
            c.normalizedName, c.length, c.entryFlowName,
            [...new Set(c.linkages.map((l) => l.linkType))].join(", "),
            c.steps.map((s) => s.flowName).join(" -> "),
          ]),
        },
        {
          name: "Standalone",
          headers: ["iFlow", "Package", "Flow ID"],
          rows: result.standalone.map((s) => [s.flowName, s.packageName, s.flowId]),
        },
        {
          name: "Broken Links",
          headers: ["Address", "Type", "Producer", "Consumer", "Reason"],
          rows: result.broken.map((b) => [
            b.address, b.linkType, b.producerFlowName || "Missing",
            b.consumerFlowName || "Missing", b.reason,
          ]),
        },
      ],
      "cpi-normalized-flows.xlsx"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Normalized Flow Mapper</h1>
        <p className="text-muted-foreground">Concatenate JMS/ProcessDirect-chained iFlows into end-to-end logical flows</p>
      </div>

      {hydrated && !result && <NoSnapshotPlaceholder />}

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.chains.length}</p>
                <p className="text-xs text-muted-foreground">Chains</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.standalone.length}</p>
                <p className="text-xs text-muted-foreground">Standalone</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.avgChainLength}</p>
                <p className="text-xs text-muted-foreground">Avg Chain Length</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-orange-500">{result.broken.length}</p>
                <p className="text-xs text-muted-foreground">Broken Links</p>
              </CardContent>
            </Card>
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(result, "cpi-normalized-flows.json")}
          />

          <Tabs defaultValue="chains">
            <TabsList>
              <TabsTrigger value="chains">Chains ({result.chains.length})</TabsTrigger>
              <TabsTrigger value="standalone">Standalone ({result.standalone.length})</TabsTrigger>
              <TabsTrigger value="broken">Broken ({result.broken.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="chains">
              <DataTable columns={chainColumns} data={result.chains} searchPlaceholder="Search chains..." initialFilter={initialFilter} />
            </TabsContent>
            <TabsContent value="standalone">
              <DataTable columns={standaloneColumns} data={result.standalone} searchPlaceholder="Search standalone..." initialFilter={initialFilter} />
            </TabsContent>
            <TabsContent value="broken">
              <DataTable columns={brokenColumns} data={result.broken} searchPlaceholder="Search broken links..." />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
