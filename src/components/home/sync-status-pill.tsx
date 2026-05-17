"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatLastSync, formatJerusalemTimeOfDay } from "@/lib/formatters";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ActivitySnapshot, HomeBankHealthItem } from "@/lib/types";

interface Props {
  items: HomeBankHealthItem[] | null;
  nextScheduledSync: string | null;
  activity: ActivitySnapshot | null;
  onOpenChange?: (open: boolean) => void;
}

type PillTone = "ok" | "warn" | "error" | "muted" | "active";

interface PillState {
  tone: PillTone;
  label: string;
  detail: string | null;
}

function describe(items: HomeBankHealthItem[] | null): PillState {
  if (!items || items.length === 0) {
    return { tone: "muted", label: "No banks connected", detail: null };
  }

  const errors = items.filter((i) => i.status === "error");
  if (errors.length > 0) {
    return {
      tone: "error",
      label:
        errors.length === 1
          ? "1 bank failed"
          : `${errors.length} banks failed`,
      detail: errors.map((e) => e.providerName).join(", "),
    };
  }

  const okItems = items.filter((i) => i.status === "ok");
  const staleItems = items.filter((i) => i.status === "stale");
  const everSynced = items.filter((i) => i.lastSyncAt != null);

  if (everSynced.length === 0) {
    return { tone: "muted", label: "Never synced", detail: null };
  }

  const oldestSync = everSynced.reduce<string | null>((oldest, i) => {
    if (!i.lastSyncAt) return oldest;
    if (!oldest) return i.lastSyncAt;
    return new Date(i.lastSyncAt + "Z").getTime() <
      new Date(oldest + "Z").getTime()
      ? i.lastSyncAt
      : oldest;
  }, null);

  if (staleItems.length > 0 && okItems.length === 0) {
    return {
      tone: "warn",
      label: `Last sync ${formatLastSync(oldestSync)}`,
      detail: staleItems.map((s) => s.providerName).join(", "),
    };
  }

  return {
    tone: "ok",
    label: `Synced ${formatLastSync(oldestSync)}`,
    detail: null,
  };
}

const TONE_STYLES: Record<PillTone, { dot: string; text: string; ring: string; pulse: boolean }> = {
  ok: {
    dot: "bg-[var(--status-on-track)]",
    text: "text-foreground",
    ring: "ring-[color-mix(in_oklch,var(--status-on-track)_30%,var(--border))]",
    pulse: false,
  },
  warn: {
    dot: "bg-[var(--status-heads-up)]",
    text: "text-foreground",
    ring: "ring-[color-mix(in_oklch,var(--status-heads-up)_35%,var(--border))]",
    pulse: false,
  },
  error: {
    dot: "bg-[var(--status-over)]",
    text: "text-[var(--status-over)]",
    ring: "ring-[color-mix(in_oklch,var(--status-over)_45%,var(--border))]",
    pulse: false,
  },
  muted: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    ring: "ring-border",
    pulse: false,
  },
  active: {
    dot: "bg-[var(--accent)]",
    text: "text-foreground",
    ring: "ring-[color-mix(in_oklch,var(--accent)_45%,var(--border))]",
    pulse: true,
  },
};

function formatElapsed(sinceIso: string | null): string {
  if (!sinceIso) return "";
  const start = new Date(sinceIso).getTime();
  const ageMs = Date.now() - start;
  if (!Number.isFinite(ageMs) || ageMs < 0) return "just now";
  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

function useTick(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function SyncStatusPill({
  items,
  nextScheduledSync,
  activity,
  onOpenChange,
}: Props) {
  const syncActive = activity?.sync.active === true;
  const syncStale = activity?.sync.stale === true;
  useTick(syncActive);

  const baseState = useMemo<PillState>(() => describe(items), [items]);
  let state: PillState = baseState;
  if (syncActive && syncStale) {
    state = { tone: "warn", label: "Sync may be stuck", detail: null };
  } else if (syncActive) {
    const elapsed = formatElapsed(activity?.sync.since ?? null);
    state = {
      tone: "active",
      label: elapsed ? `Syncing now · ${elapsed}` : "Syncing now",
      detail: null,
    };
  }

  const styles = TONE_STYLES[state.tone];

  const nextText = nextScheduledSync
    ? `next ${formatJerusalemTimeOfDay(nextScheduledSync)}`
    : null;

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs ring-1 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              styles.text,
              styles.ring
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                styles.dot,
                styles.pulse && "animate-pulse"
              )}
            />
            <span className="font-medium">{state.label}</span>
            {nextText && !syncActive && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-muted-foreground">{nextText}</span>
              </>
            )}
          </button>
        }
      />
      <PopoverContent>
        <ActivityPanel activity={activity} />
      </PopoverContent>
    </Popover>
  );
}

function ActivityPanel({ activity }: { activity: ActivitySnapshot | null }) {
  const sync = activity?.sync;
  const scheduler = activity?.scheduler;
  const ollama = activity?.ollama;

  let syncRow: { tone: PillTone; text: string };
  if (!sync) {
    syncRow = { tone: "muted", text: "Loading…" };
  } else if (!sync.active) {
    syncRow = { tone: "muted", text: "Idle" };
  } else if (sync.stale) {
    syncRow = { tone: "warn", text: "May be stuck" };
  } else {
    const elapsed = formatElapsed(sync.since);
    const kindLabel = sync.kind === "scheduled" ? "scheduled" : "manual";
    syncRow = {
      tone: "active",
      text: elapsed ? `Syncing (${kindLabel}, ${elapsed})` : `Syncing (${kindLabel})`,
    };
  }

  const schedulerRow: { tone: PillTone; text: string } = scheduler?.armed
    ? {
        tone: "ok",
        text: `Next ${formatJerusalemTimeOfDay(scheduler.nextRunAt!)}`,
      }
    : { tone: "muted", text: "Off" };

  const ollamaRow: { tone: PillTone; text: string } = ollama?.running
    ? { tone: "ok", text: "Running (started by Spent)" }
    : { tone: "muted", text: "Not running" };

  return (
    <div className="space-y-2.5">
      <div className="text-xs font-medium text-foreground">
        What Spent is running
      </div>
      <Row label="Sync" value={syncRow.text} tone={syncRow.tone} />
      <Row label="Scheduler" value={schedulerRow.text} tone={schedulerRow.tone} />
      <Row label="Ollama" value={ollamaRow.text} tone={ollamaRow.tone} />
      <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
        These are the only background things Spent does. Ollama processes you
        started yourself aren&apos;t shown.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: PillTone;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            styles.dot,
            styles.pulse && "animate-pulse"
          )}
        />
        {label}
      </div>
      <div className={cn("text-right", styles.text)}>{value}</div>
    </div>
  );
}
