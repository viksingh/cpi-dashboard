"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useExtractionStore } from "@/stores/extraction-store";
import { useStoreHydrated } from "@/hooks/use-store-hydration";
import { useFlowIdFilter } from "@/hooks/use-flow-id-filter";
import { NoSnapshotPlaceholder } from "@/components/shared/no-snapshot-placeholder";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Search } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot, detectCycles, getImpactedFlows, getOrphanFlows, getDependencyCountsByType } from "@/lib/analysis/dependency-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { DependencyGraph, Dependency, DependencyType } from "@/types/dependency";
import { DependencyTypeLabels } from "@/types/dependency";
import { flowLink } from "@/lib/flow-navigation";

const depColumns: ColumnDef<Dependency, unknown>[] = [
  {
    accessorKey: "sourceFlowName", header: "Source Flow",
    cell: ({ row }) => (
      <Link href={flowLink("/normalized-flows", row.original.sourceFlowId)} className="text-primary hover:underline">
        {row.original.sourceFlowName}
      </Link>
    ),
  },
  {
    accessorKey: "targetFlowName", header: "Target Flow",
    cell: ({ row }) => (
      <Link href={flowLink("/normalized-flows", row.original.targetFlowId)} className="text-primary hover:underline">
        {row.original.targetFlowName}
      </Link>
    ),
  },
  {
    accessorKey: "type", header: "Type",
    cell: ({ row }) => <Badge variant="outline">{DependencyTypeLabels[row.original.type]}</Badge>,
  },
  { accessorKey: "details", header: "Details" },
  { accessorKey: "sourcePackageId", header: "Source Package" },
  { accessorKey: "targetPackageId", header: "Target Package" },
];

export default function DependenciesPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const initialFilter = useFlowIdFilter(extractionResult);
  const [impactFlowId, setImpactFlowId] = useState("");

  const graph = useMemo<DependencyGraph | null>(
    () => extractionResult ? analyzeFromSnapshot(extractionResult, extractionResult.tenantUrl || "") : null,
    [extractionResult]
  );

  const cycles = useMemo(() => (graph ? detectCycles(graph) : []), [graph]);
  const orphans = useMemo(() => (graph ? getOrphanFlows(graph) : []), [graph]);
  const counts = useMemo(() => (graph ? getDependencyCountsByType(graph) : {}), [graph]);
  const impacted = useMemo(
    () => (graph && impactFlowId ? Array.from(getImpactedFlows(graph, impactFlowId)) : []),
    [graph, impactFlowId]
  );

  const handleExportExcel = async () => {
    if (!graph) return;
    await exportExcel(
      [{
        name: "Dependencies",
        headers: ["Source Flow", "Target Flow", "Type", "Details", "Source Package", "Target Package"],
        rows: graph.dependencies.map((d) => [d.sourceFlowName, d.targetFlowName, DependencyTypeLabels[d.type], d.details, d.sourcePackageId || "", d.targetPackageId || ""]),
      }],
      "cpi-dependencies.xlsx"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dependency Mapper</h1>
        <p className="text-muted-foreground">Analyze iFlow dependencies, detect cycles, and assess impact</p>
      </div>

      {hydrated && !graph && <NoSnapshotPlaceholder />}

      {graph && (
        <>
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{Object.keys(graph.flowsById).length}</p>
                <p className="text-xs text-muted-foreground">iFlows Analyzed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{graph.dependencies.length}</p>
                <p className="text-xs text-muted-foreground">Dependencies Found</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-yellow-500">{cycles.length}</p>
                <p className="text-xs text-muted-foreground">Circular Dependencies</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{orphans.length}</p>
                <p className="text-xs text-muted-foreground">Orphan Flows</p>
              </CardContent>
            </Card>
          </div>

          {/* Type breakdown */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(counts).map(([type, count]) => (
              <Badge key={type} variant="outline">
                {DependencyTypeLabels[type as DependencyType]}: {String(count)}
              </Badge>
            ))}
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(graph, "cpi-dependencies.json")}
          />

          <Tabs defaultValue="deps">
            <TabsList>
              <TabsTrigger value="deps">Dependencies ({graph.dependencies.length})</TabsTrigger>
              <TabsTrigger value="cycles">Cycles ({cycles.length})</TabsTrigger>
              <TabsTrigger value="impact">Impact Analysis</TabsTrigger>
              <TabsTrigger value="orphans">Orphans ({orphans.length})</TabsTrigger>
              <TabsTrigger value="unresolved">Unresolved ({graph.unresolvedReferences.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="deps">
              <DataTable columns={depColumns} data={graph.dependencies} searchPlaceholder="Search dependencies..." initialFilter={initialFilter} />
            </TabsContent>

            <TabsContent value="cycles">
              {cycles.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No circular dependencies detected</p>
              ) : (
                <div className="space-y-3">
                  {cycles.map((cycle, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium">Cycle {i + 1}:</span>
                        </div>
                        <p className="mt-1 text-sm">{cycle}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="impact">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Enter flow ID to analyze impact..."
                    value={impactFlowId}
                    onChange={(e) => setImpactFlowId(e.target.value)}
                    className="max-w-md"
                  />
                </div>
                {impactFlowId && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {impacted.length} flows impacted by changes to {graph.flowsById[impactFlowId]?.name || impactFlowId}:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {impacted.map((id) => (
                        <Badge key={id} variant="outline">
                          {graph.flowsById[id]?.name || id}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="orphans">
              {orphans.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">All flows have at least one dependency</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {orphans.map((id) => (
                    <Badge key={id} variant="secondary">
                      {graph.flowsById[id]?.name || id}
                    </Badge>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="unresolved">
              {graph.unresolvedReferences.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No unresolved references</p>
              ) : (
                <div className="space-y-1">
                  {graph.unresolvedReferences.map((ref, i) => (
                    <p key={i} className="text-sm text-muted-foreground">{ref}</p>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
