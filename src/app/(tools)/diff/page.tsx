"use client";

import { useState, useMemo } from "react";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitCompare, Plus, Minus, Pen, Equal } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import type { ExtractionResult } from "@/types/cpi";
import type { DiffResult, DiffEntry, DiffStatus, FieldChange } from "@/types/diff";
import { exportExcel } from "@/exporters/excel-exporter";

// Client-side diff engine (inline for simplicity)
function compareSnapshots(a: ExtractionResult, b: ExtractionResult): DiffResult {
  function nullSafe(v: unknown): string {
    return v === null || v === undefined ? "" : String(v);
  }
  function compareField(changes: FieldChange[], fieldName: string, oldVal: unknown, newVal: unknown) {
    const ov = nullSafe(oldVal);
    const nv = nullSafe(newVal);
    if (ov !== nv) changes.push({ fieldName, oldValue: ov, newValue: nv });
  }
  function diffList<T extends Record<string, unknown>>(
    listA: T[], listB: T[], idKey: string, nameKey: string, comparator: (a: T, b: T) => FieldChange[]
  ): DiffEntry<Record<string, unknown>>[] {
    const mapA = new Map(listA.map((item) => [String(item[idKey]), item]));
    const mapB = new Map(listB.map((item) => [String(item[idKey]), item]));
    const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
    const entries: DiffEntry<Record<string, unknown>>[] = [];
    for (const key of allKeys) {
      const itemA = mapA.get(key) || null;
      const itemB = mapB.get(key) || null;
      if (!itemA && itemB) {
        entries.push({ id: key, name: String(itemB[nameKey]), status: "ADDED", itemA: null, itemB, changes: [] });
      } else if (itemA && !itemB) {
        entries.push({ id: key, name: String(itemA[nameKey]), status: "REMOVED", itemA, itemB: null, changes: [] });
      } else if (itemA && itemB) {
        const changes = comparator(itemA, itemB);
        entries.push({
          id: key, name: String(itemB[nameKey]),
          status: changes.length > 0 ? "MODIFIED" : "UNCHANGED",
          itemA, itemB, changes,
        });
      }
    }
    return entries;
  }

  const packageDiffs = diffList(a.packages as any[], b.packages as any[], "id", "name", (pa, pb) => {
    const c: FieldChange[] = [];
    for (const f of ["name", "description", "version", "vendor", "mode", "supportedPlatform", "modifiedBy", "creationDate", "modifiedDate", "createdBy", "products", "keywords"]) {
      compareField(c, f, pa[f], pb[f]);
    }
    return c;
  });

  const flowDiffs = diffList(a.allFlows as any[], b.allFlows as any[], "id", "name", (fa, fb) => {
    const c: FieldChange[] = [];
    for (const f of ["name", "description", "version", "packageId", "sender", "receiver", "createdBy", "createdAt", "modifiedBy", "modifiedAt", "runtimeStatus", "deployedVersion", "deployedBy", "deployedAt"]) {
      compareField(c, f, fa[f], fb[f]);
    }
    return c;
  });

  const vmDiffs = diffList(a.allValueMappings as any[], b.allValueMappings as any[], "id", "name", (va, vb) => {
    const c: FieldChange[] = [];
    for (const f of ["name", "description", "version", "packageId", "createdBy", "createdAt", "modifiedBy", "modifiedAt", "runtimeStatus"]) {
      compareField(c, f, va[f], vb[f]);
    }
    return c;
  });

  // Flatten configs
  function flattenConfigs(flows: ExtractionResult["allFlows"]) {
    return flows.flatMap((f) => (f.configurations || []).map((c) => ({
      ...c, artifactId: c.artifactId || f.id, _id: `${c.artifactId || f.id}|${c.parameterKey}`, _name: `${c.artifactId || f.id} / ${c.parameterKey}`,
    })));
  }
  const configDiffs = diffList(flattenConfigs(a.allFlows) as any[], flattenConfigs(b.allFlows) as any[], "_id", "_name", (ca, cb) => {
    const c: FieldChange[] = [];
    compareField(c, "parameterValue", ca.parameterValue, cb.parameterValue);
    compareField(c, "dataType", ca.dataType, cb.dataType);
    return c;
  });

  const runtimeDiffs = diffList(a.runtimeArtifacts as any[], b.runtimeArtifacts as any[], "id", "name", (ra, rb) => {
    const c: FieldChange[] = [];
    for (const f of ["name", "version", "type", "status", "deployedBy", "deployedOn", "errorInformation"]) {
      compareField(c, f, ra[f], rb[f]);
    }
    return c;
  });

  return {
    snapshotALabel: a.tenantUrl || "Snapshot A",
    snapshotBLabel: b.tenantUrl || "Snapshot B",
    snapshotADate: a.extractedAt || "",
    snapshotBDate: b.extractedAt || "",
    packageDiffs, flowDiffs, valueMappingDiffs: vmDiffs, configurationDiffs: configDiffs, runtimeDiffs,
  };
}

const statusIcon = (s: DiffStatus) => {
  switch (s) {
    case "ADDED": return <Plus className="h-3 w-3 text-green-500" />;
    case "REMOVED": return <Minus className="h-3 w-3 text-red-500" />;
    case "MODIFIED": return <Pen className="h-3 w-3 text-yellow-500" />;
    default: return <Equal className="h-3 w-3 text-muted-foreground" />;
  }
};

const statusBadge = (s: DiffStatus) => {
  const variant = s === "ADDED" ? "success" : s === "REMOVED" ? "destructive" : s === "MODIFIED" ? "warning" : "secondary";
  return <Badge variant={variant}>{s}</Badge>;
};

function makeDiffColumns(): ColumnDef<DiffEntry<Record<string, unknown>>, unknown>[] {
  return [
    {
      accessorKey: "status", header: "Status",
      cell: ({ row }) => statusBadge(row.original.status),
    },
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "changes", header: "Changes",
      cell: ({ row }) => {
        const changes = row.original.changes;
        if (changes.length === 0) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="space-y-1 text-xs">
            {changes.map((c, i) => (
              <div key={i}>
                <span className="font-medium">{c.fieldName}:</span>{" "}
                <span className="text-red-500 line-through">{c.oldValue || "(empty)"}</span>{" "}
                <span className="text-green-500">{c.newValue || "(empty)"}</span>
              </div>
            ))}
          </div>
        );
      },
    },
  ];
}

export default function DiffPage() {
  const [snapshotA, setSnapshotA] = useState<{ data: ExtractionResult; name: string } | null>(null);
  const [snapshotB, setSnapshotB] = useState<{ data: ExtractionResult; name: string } | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [hideUnchanged, setHideUnchanged] = useState(true);

  const handleCompare = () => {
    if (snapshotA && snapshotB) {
      const result = compareSnapshots(snapshotA.data, snapshotB.data);
      setDiffResult(result);
    }
  };

  const filterEntries = (entries: DiffEntry<Record<string, unknown>>[]) =>
    hideUnchanged ? entries.filter((e) => e.status !== "UNCHANGED") : entries;

  const columns = useMemo(makeDiffColumns, []);

  const countByStatus = (entries: DiffEntry<Record<string, unknown>>[]) => ({
    added: entries.filter((e) => e.status === "ADDED").length,
    removed: entries.filter((e) => e.status === "REMOVED").length,
    modified: entries.filter((e) => e.status === "MODIFIED").length,
    unchanged: entries.filter((e) => e.status === "UNCHANGED").length,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Snapshot Diff</h1>
        <p className="text-muted-foreground">Compare two CPI snapshots side-by-side</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Snapshot A (Before)</CardTitle>
          </CardHeader>
          <CardContent>
            <SnapshotLoader
              onLoad={(data, name) => setSnapshotA({ data, name })}
              label="Load Snapshot A"
            />
            {snapshotA && (
              <div className="mt-3 text-sm">
                <p className="font-medium">{snapshotA.name}</p>
                <p className="text-muted-foreground">
                  {snapshotA.data.packages.length} packages, {snapshotA.data.allFlows.length} flows
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Snapshot B (After)</CardTitle>
          </CardHeader>
          <CardContent>
            <SnapshotLoader
              onLoad={(data, name) => setSnapshotB({ data, name })}
              label="Load Snapshot B"
            />
            {snapshotB && (
              <div className="mt-3 text-sm">
                <p className="font-medium">{snapshotB.name}</p>
                <p className="text-muted-foreground">
                  {snapshotB.data.packages.length} packages, {snapshotB.data.allFlows.length} flows
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={handleCompare} disabled={!snapshotA || !snapshotB}>
          <GitCompare className="h-4 w-4" />
          Compare
        </Button>
        {diffResult && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideUnchanged}
              onChange={(e) => setHideUnchanged(e.target.checked)}
              className="rounded"
            />
            Hide unchanged
          </label>
        )}
      </div>

      {diffResult && (
        <>
          <div className="grid gap-4 sm:grid-cols-5">
            {[
              { label: "Packages", data: diffResult.packageDiffs },
              { label: "Flows", data: diffResult.flowDiffs },
              { label: "Value Mappings", data: diffResult.valueMappingDiffs },
              { label: "Configurations", data: diffResult.configurationDiffs },
              { label: "Runtime", data: diffResult.runtimeDiffs },
            ].map(({ label, data }) => {
              const c = countByStatus(data);
              return (
                <Card key={label}>
                  <CardContent className="p-4">
                    <p className="font-medium text-sm">{label}</p>
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {c.added > 0 && <Badge variant="success">+{c.added}</Badge>}
                      {c.removed > 0 && <Badge variant="destructive">-{c.removed}</Badge>}
                      {c.modified > 0 && <Badge variant="warning">~{c.modified}</Badge>}
                      {c.unchanged > 0 && <Badge variant="secondary">={c.unchanged}</Badge>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Tabs defaultValue="flows">
            <TabsList className="flex-wrap">
              <TabsTrigger value="packages">Packages</TabsTrigger>
              <TabsTrigger value="flows">Flows</TabsTrigger>
              <TabsTrigger value="valuemappings">Value Mappings</TabsTrigger>
              <TabsTrigger value="configs">Configurations</TabsTrigger>
              <TabsTrigger value="runtime">Runtime</TabsTrigger>
            </TabsList>
            <TabsContent value="packages">
              <DataTable columns={columns} data={filterEntries(diffResult.packageDiffs)} searchPlaceholder="Search packages..." />
            </TabsContent>
            <TabsContent value="flows">
              <DataTable columns={columns} data={filterEntries(diffResult.flowDiffs)} searchPlaceholder="Search flows..." />
            </TabsContent>
            <TabsContent value="valuemappings">
              <DataTable columns={columns} data={filterEntries(diffResult.valueMappingDiffs)} searchPlaceholder="Search value mappings..." />
            </TabsContent>
            <TabsContent value="configs">
              <DataTable columns={columns} data={filterEntries(diffResult.configurationDiffs)} searchPlaceholder="Search configurations..." />
            </TabsContent>
            <TabsContent value="runtime">
              <DataTable columns={columns} data={filterEntries(diffResult.runtimeDiffs)} searchPlaceholder="Search runtime..." />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
