"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, ArrowRight } from "lucide-react";

export function NoSnapshotPlaceholder() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12">
        <Upload className="h-10 w-10 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">No snapshot loaded</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Load or extract a CPI snapshot to use this analysis tool.
          </p>
        </div>
        <Link href="/extractor">
          <Button variant="outline">
            Go to Extractor
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
