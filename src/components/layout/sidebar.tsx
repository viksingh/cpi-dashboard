"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Download,
  Camera,
  GitCompare,
  Network,
  MapPin,
  AlertTriangle,
  List,
  X,
  Workflow,
  CalendarCheck,
  Shapes,
  KeyRound,
  Cloud,
  BarChart3,
  Globe,
  BookOpen,
  Hash,
  FileText,
  ScanSearch,
  ShieldCheck,
  HeartPulse,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/extractor", label: "Extractor", icon: Download },
  { href: "/snapshot", label: "Snapshot", icon: Camera },
  { href: "/diff", label: "Snapshot Diff", icon: GitCompare },
  { href: "/dependencies", label: "Dependencies", icon: Network },
  { href: "/endpoints", label: "Endpoints", icon: MapPin },
  { href: "/tech-debt", label: "Tech Debt", icon: AlertTriangle },
  { href: "/inventory", label: "Inventory", icon: List },
  { href: "/normalized-flows", label: "Flow Chains", icon: Workflow },
  { href: "/cutover", label: "Cutover Plan", icon: CalendarCheck },
  { href: "/patterns", label: "Patterns", icon: Shapes },
  { href: "/credentials", label: "Credentials", icon: KeyRound },
  { href: "/cloud-connector", label: "Cloud Connector", icon: Cloud },
  { href: "/adapter-census", label: "Adapter Census", icon: BarChart3 },
  { href: "/external-systems", label: "External Systems", icon: Globe },
  { href: "/pattern-cataloger", label: "Pattern Catalog", icon: BookOpen },
  { href: "/number-ranges", label: "Number Ranges", icon: Hash },
  { href: "/req-docgen", label: "Req Doc Gen", icon: FileText },
  { href: "/param-auditor", label: "Param Auditor", icon: ScanSearch },
  { href: "/cert-expiry", label: "Cert Monitor", icon: ShieldCheck },
  { href: "/health-check", label: "Health Check", icon: HeartPulse },
  { href: "/runbook", label: "Runbook", icon: ClipboardList },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold" onClick={onClose}>
            <Network className="h-5 w-5 text-primary" />
            <span>CPI Dashboard</span>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Separator className="my-4" />

          <div className="px-3 text-xs text-muted-foreground">
            <p>SAP CPI Management Toolkit</p>
            <p className="mt-1">v1.0.0</p>
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}
