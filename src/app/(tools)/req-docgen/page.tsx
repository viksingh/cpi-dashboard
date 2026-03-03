"use client";

import { useState, useMemo } from "react";
import { useExtractionStore } from "@/stores/extraction-store";
import { useStoreHydrated } from "@/hooks/use-store-hydration";
import { NoSnapshotPlaceholder } from "@/components/shared/no-snapshot-placeholder";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/req-doc-generator";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { RequirementDoc } from "@/types/req-doc";

const columns: ColumnDef<RequirementDoc, unknown>[] = [
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  { accessorKey: "sourceSystem", header: "Source" },
  { accessorKey: "targetSystem", header: "Target" },
  {
    accessorKey: "protocols", header: "Protocols",
    cell: ({ row }) => row.original.protocols.join(", ") || "-",
  },
  {
    accessorKey: "eccRelated", header: "ECC",
    cell: ({ row }) => row.original.eccRelated ? <Badge variant="destructive">ECC</Badge> : <span className="text-muted-foreground">-</span>,
  },
  { accessorKey: "errorHandling", header: "Error Handling" },
  {
    accessorKey: "runtimeStatus", header: "Status",
    cell: ({ row }) => {
      const s = row.original.runtimeStatus;
      const v = s === "STARTED" ? "success" : s === "ERROR" ? "destructive" : "secondary";
      return <Badge variant={v}>{s || "N/A"}</Badge>;
    },
  },
];

export default function ReqDocgenPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const result = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);
  const [selectedDoc, setSelectedDoc] = useState<RequirementDoc | null>(null);

  const eccDocs = useMemo(() => result?.documents.filter((d) => d.eccRelated) || [], [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel([{
      name: "Requirements",
      headers: ["iFlow", "Package", "Description", "Source", "Target", "Protocols", "Adapters",
        "Configs", "Scripts", "Mappings", "ECC", "ECC Indicators", "Error Handling", "Proposed S/4 State", "Status"],
      rows: result.documents.map((d) => [
        d.flowName, d.packageName, d.description, d.sourceSystem, d.targetSystem,
        d.protocols.join(", "), d.adapterTypes.join(", "),
        d.configurations.length, d.scripts.join(", "), d.mappings.join(", "),
        d.eccRelated ? "Yes" : "", d.eccIndicators.join("; "),
        d.errorHandling, d.proposedS4State, d.runtimeStatus,
      ]),
    }], "cpi-requirements.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integration Requirement Doc Generator</h1>
        <p className="text-muted-foreground">Auto-generate migration requirements per iFlow with S/4 target state</p>
      </div>
      {hydrated && !result && <NoSnapshotPlaceholder />}
      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.totalFlows}</p><p className="text-xs text-muted-foreground">Total Flows</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-red-500">{result.eccFlows}</p><p className="text-xs text-muted-foreground">ECC Flows</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.totalFlows - result.eccFlows}</p><p className="text-xs text-muted-foreground">Non-ECC Flows</p></CardContent></Card>
          </div>
          <ExportToolbar onExportExcel={handleExportExcel} onExportJson={() => exportGenericJson(result, "cpi-requirements.json")} />
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({result.totalFlows})</TabsTrigger>
              <TabsTrigger value="ecc">ECC ({eccDocs.length})</TabsTrigger>
              <TabsTrigger value="detail">Detail View</TabsTrigger>
            </TabsList>
            <TabsContent value="all"><DataTable columns={columns} data={result.documents} searchPlaceholder="Search flows..." /></TabsContent>
            <TabsContent value="ecc"><DataTable columns={columns} data={eccDocs} searchPlaceholder="Search ECC flows..." /></TabsContent>
            <TabsContent value="detail">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1 max-h-[600px] overflow-y-auto border rounded-lg p-2">
                  {result.documents.map((doc) => (
                    <button key={doc.flowId} onClick={() => setSelectedDoc(doc)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${selectedDoc?.flowId === doc.flowId ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent"}`}>
                      {doc.flowName}
                      {doc.eccRelated && <Badge variant="destructive" className="ml-2 text-xs">ECC</Badge>}
                    </button>
                  ))}
                </div>
                <div className="sm:col-span-2">
                  {selectedDoc ? (
                    <Card><CardContent className="p-4 space-y-3 text-sm">
                      <h3 className="text-lg font-semibold">{selectedDoc.flowName}</h3>
                      <p className="text-muted-foreground">{selectedDoc.description || "No description"}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div><strong>Package:</strong> {selectedDoc.packageName}</div>
                        <div><strong>Status:</strong> {selectedDoc.runtimeStatus}</div>
                        <div><strong>Source:</strong> {selectedDoc.sourceSystem || "-"}</div>
                        <div><strong>Target:</strong> {selectedDoc.targetSystem || "-"}</div>
                        <div><strong>Created:</strong> {selectedDoc.createdBy} ({selectedDoc.createdAt})</div>
                        <div><strong>Modified:</strong> {selectedDoc.modifiedBy} ({selectedDoc.modifiedAt})</div>
                      </div>
                      <div><strong>Protocols:</strong> {selectedDoc.protocols.join(", ") || "-"}</div>
                      <div><strong>Adapters:</strong> {selectedDoc.adapterTypes.join(", ") || "-"}</div>
                      <div><strong>Scripts:</strong> {selectedDoc.scripts.join(", ") || "None"}</div>
                      <div><strong>Mappings:</strong> {selectedDoc.mappings.join(", ") || "None"}</div>
                      <div><strong>Error Handling:</strong> {selectedDoc.errorHandling}</div>
                      {selectedDoc.eccRelated && (
                        <div className="p-3 bg-red-50 dark:bg-red-950 rounded-md">
                          <strong className="text-red-600">ECC Indicators:</strong>
                          <ul className="list-disc list-inside mt-1">{selectedDoc.eccIndicators.map((ind, i) => <li key={i}>{ind}</li>)}</ul>
                        </div>
                      )}
                      <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md">
                        <strong className="text-blue-600">Proposed S/4 Target State:</strong>
                        <p className="mt-1">{selectedDoc.proposedS4State}</p>
                      </div>
                      {selectedDoc.configurations.length > 0 && (
                        <div><strong>Configurations ({selectedDoc.configurations.length}):</strong>
                          <div className="mt-1 max-h-40 overflow-y-auto text-xs font-mono bg-muted/50 rounded p-2">
                            {selectedDoc.configurations.map((c, i) => <div key={i}>{c.key} = {c.value}</div>)}
                          </div>
                        </div>
                      )}
                    </CardContent></Card>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">Select an iFlow to view its requirement document</p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
