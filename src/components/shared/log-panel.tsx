"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LogPanelProps {
  logs: string[];
  maxHeight?: string;
}

export function LogPanel({ logs, maxHeight = "200px" }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/30">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
        Activity Log ({logs.length} entries)
      </div>
      <ScrollArea style={{ maxHeight }}>
        <div className="p-3 font-mono text-xs space-y-1">
          {logs.map((log, i) => (
            <div key={i} className="text-muted-foreground">
              {log}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
