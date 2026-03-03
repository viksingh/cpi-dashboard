"use client";

import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import { Menu, Moon, Sun, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExtractionStore } from "@/stores/extraction-store";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const result = useExtractionStore((s) => s.result);
  const snapshotName = useExtractionStore((s) => s.snapshotName);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Snapshot indicator */}
      {result && (
        <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="truncate max-w-48">{snapshotName || "Snapshot loaded"}</span>
          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
            {result.allFlows.length} flows
          </span>
        </div>
      )}

      <div className="flex-1" />

      {/* User section */}
      {session?.user && (
        <div className="flex items-center gap-2">
          {session.user.image && (
            <img
              src={session.user.image}
              alt=""
              className="h-7 w-7 rounded-full"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="hidden sm:inline text-sm text-muted-foreground">
            {session.user.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Sign out</span>
          </Button>
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    </header>
  );
}
