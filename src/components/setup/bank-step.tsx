"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, X } from "lucide-react";
import {
  BANK_PROVIDERS,
  type BankKind,
  type BankProviderInfo,
} from "@/lib/types";
import {
  listIntegrations,
  saveBankCredentials,
  testBankConnection,
  getIntegrationCredentials,
  deleteIntegration,
  importCsv,
} from "@/lib/api";
import { ProviderBadge } from "./provider-badge";
import { TwoFactorSection } from "./two-factor-section";
import { toast } from "sonner";

type Sub = "pick" | "form" | "ready" | "csv";

const NUMBER_WORDS: Record<number, string> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
};

interface BankStepProps {
  onComplete: () => void;
}

export function BankStep({ onComplete }: BankStepProps) {
  const [filter, setFilter] = useState<"all" | BankKind>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingCredentialId, setEditingCredentialId] = useState<number | null>(
    null
  );
  const [sub, setSub] = useState<Sub | null>(null);
  const [csvImported, setCsvImported] = useState(false);

  const { data: integrations = [], isPending, refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });

  // Pick the right starting view once we've heard back from the query
  useEffect(() => {
    if (isPending || sub != null) return;
    setSub(integrations.length > 0 ? "ready" : "pick");
  }, [isPending, integrations.length, sub]);

  const connectedIds = new Set(integrations.map((i) => i.provider));
  const selected = selectedId
    ? (BANK_PROVIDERS.find((p) => p.id === selectedId) ?? null)
    : null;

  const filteredProviders = BANK_PROVIDERS.filter((p) => {
    if (filter !== "all" && p.kind !== filter) return false;
    if (
      search &&
      !p.name.toLowerCase().includes(search.toLowerCase()) &&
      !p.blurb.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  function handlePick(id: string) {
    setSelectedId(id);
    setEditingCredentialId(null);
    setSub("form");
  }

  function handleCloseForm() {
    setSelectedId(null);
    setEditingCredentialId(null);
    setSub(integrations.length > 0 ? "ready" : "pick");
  }

  function handleSaved() {
    refetch();
    setSelectedId(null);
    setEditingCredentialId(null);
    setSub("ready");
  }

  function handleEditCredential(credentialId: number) {
    const integ = integrations.find((i) => i.id === credentialId);
    if (!integ) return;
    setSelectedId(integ.provider);
    setEditingCredentialId(credentialId);
    setSub("form");
  }

  const editingIntegration =
    editingCredentialId != null
      ? integrations.find((i) => i.id === editingCredentialId) ?? null
      : null;

  function handleRemoved() {
    refetch();
    if (integrations.length <= 1) {
      // last one being removed — drop back to picker
      setSub("pick");
    }
  }

  if (sub == null) return null;

  const readyCountLabel = csvImported && integrations.length === 0
    ? "CSV imported. Move on or connect a bank too."
    : integrations.length === 1
      ? "One account ready. Add another or move on."
      : `${NUMBER_WORDS[integrations.length] ?? integrations.length} accounts ready. Add another or move on.`;

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6">
      {sub === "pick" && (
          <div
            key="pick"
            className="flex w-full flex-col gap-4"
          >
            {integrations.length > 0 && (
              <button
                type="button"
                onClick={() => setSub("ready")}
                className="self-start text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                ← back to connected accounts
              </button>
            )}
            <header className="space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Step 1 of 5 · Accounts
              </div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">
                Which accounts should Spent watch?
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Add every bank and card you want to track. Credentials are
                encrypted with AES-256 and stored on this machine only, never
                leaving your computer.
              </p>
            </header>

            <button
              type="button"
              onClick={() => setSub("csv")}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30 hover:text-foreground"
            >
              <Upload className="h-4 w-4" />
              Prefer not to share credentials? Import from CSV instead
            </button>

            <PickerCard
              providers={filteredProviders}
              total={BANK_PROVIDERS.length}
              connectedIds={connectedIds}
              filter={filter}
              onFilter={setFilter}
              search={search}
              onSearch={setSearch}
              onPick={handlePick}
            />

            <p className="text-xs italic text-muted-foreground">
              Don&apos;t see your bank?{" "}
              <a
                href="https://github.com/Shaya16/Spent/issues"
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline decoration-primary underline-offset-2"
              >
                Open an issue
              </a>{" "}
              and we&apos;ll add a scraper.
            </p>
          </div>
        )}

        {sub === "csv" && (
          <div key="csv" className="flex w-full flex-col gap-4">
            <button
              type="button"
              onClick={() => setSub(integrations.length > 0 ? "ready" : "pick")}
              className="self-start text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ← back
            </button>
            <header className="space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Step 1 of 5 · Import CSV
              </div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">
                Import from your bank export
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Download your transaction history from your bank&apos;s website
                and upload it here. Supported: Bank Hapoalim, Isracard, Max.
                No credentials needed.
              </p>
            </header>
            <CsvImportSubview
              onImported={() => {
                setCsvImported(true);
                setSub("ready");
              }}
            />
          </div>
        )}

        {sub === "form" && selected && (
          <div
            key={`form-${selected.id}`}
            className="flex w-full flex-col gap-4"
          >
            <button
              type="button"
              onClick={handleCloseForm}
              className="self-start text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ← back to providers
            </button>
            <header className="space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Step 1 of 5 · Connecting {selected.name}
              </div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">
                Sign in to {selected.name}
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Same credentials you use at{" "}
                <span className="text-foreground">{selected.domain}</span>.
                They&apos;re encrypted locally, nothing leaves this machine.
              </p>
            </header>

            <CredentialForm
              key={`${selected.id}-${editingCredentialId ?? "new"}`}
              info={selected}
              credentialId={editingCredentialId}
              initialLabel={editingIntegration?.label ?? ""}
              isEdit={editingCredentialId != null}
              onClose={handleCloseForm}
              onSaved={handleSaved}
            />
          </div>
        )}

        {sub === "ready" && integrations.length > 0 && (
          <div
            key="ready"
            className="flex w-full flex-col gap-4"
          >
            <header className="space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Step 1 of 5 · Accounts
              </div>
              <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">
                {readyCountLabel}
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You can always come back from Settings to add or remove accounts.
              </p>
            </header>

            <div className="w-full space-y-2 text-start">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Connected · {integrations.length}
              </div>
              <AnimatePresence initial={false}>
                {integrations.map((integ) => {
                  const info = BANK_PROVIDERS.find(
                    (p) => p.id === integ.provider
                  );
                  if (!info) return null;
                  return (
                    <motion.div
                      key={integ.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -16, height: 0 }}
                      transition={{ duration: 0.22 }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <ProviderBadge
                        color={info.color}
                        name={info.name}
                        domain={info.domain}
                        size={36}
                        radius={9}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold tracking-tight">
                          {integ.label}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {info.name}
                        </div>
                      </div>
                      <span className="rounded-full bg-primary/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                        ✓ Ready
                      </span>
                      <button
                        type="button"
                        onClick={() => handleEditCredential(integ.id)}
                        className="rounded-md px-2 py-1 text-xs font-medium hover:bg-accent"
                      >
                        Edit
                      </button>
                      <RemoveButton
                        credentialId={integ.id}
                        onRemoved={handleRemoved}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            <footer className="mt-2 flex flex-col gap-2 pt-2">
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setSub("pick")}
                >
                  + Add another account
                </Button>
                <Button
                  onClick={onComplete}
                  disabled={integrations.length === 0 && !csvImported}
                >
                  Continue to AI →
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setSub("csv")}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30 hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" />
                Import transactions from CSV instead
              </button>
            </footer>
          </div>
        )}

      <div className="mt-2 flex w-full items-center justify-between text-[10px] text-muted-foreground/80">
        <span>🔐 AES-256-GCM · stored locally</span>
        <span>
          {integrations.length} of {BANK_PROVIDERS.length} providers connected
        </span>
      </div>
    </div>
  );
}

function PickerCard({
  providers,
  total,
  connectedIds,
  filter,
  onFilter,
  search,
  onSearch,
  onPick,
}: {
  providers: ReadonlyArray<BankProviderInfo>;
  total: number;
  connectedIds: Set<string>;
  filter: "all" | BankKind;
  onFilter: (v: "all" | BankKind) => void;
  search: string;
  onSearch: (v: string) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="w-full rounded-2xl border border-border bg-card p-5 text-start shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-[11px] font-bold tracking-tight">
          Supported providers · {total}
        </div>
        <FilterPills value={filter} onChange={onFilter} />
      </div>
      <Input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search by name..."
        className="mb-3"
      />
      <div className="flex flex-col gap-0.5">
        {providers.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            No providers match.
          </div>
        ) : (
          providers.map((p) => {
            const isConnected = connectedIds.has(p.id);
            const isDisabled = !p.enabled;
            return (
              <motion.button
                key={p.id}
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && onPick(p.id)}
                whileHover={!isDisabled ? { x: 1 } : undefined}
                className={`flex items-center gap-3 rounded-lg p-2.5 text-start transition-colors ${
                  isDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-muted/40"
                }`}
              >
                <ProviderBadge
                  color={p.color}
                  name={p.name}
                  domain={p.domain}
                  size={36}
                  radius={9}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold tracking-tight">
                      {p.name}
                    </span>
                    {isConnected && (
                      <span className="text-[10px] text-primary">✓</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {p.blurb}
                  </div>
                </div>
                <KindTag kind={p.kind} />
                <span
                  aria-hidden
                  className="ms-1 text-base leading-none text-muted-foreground"
                >
                  ›
                </span>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}

function KindTag({ kind }: { kind: BankKind }) {
  const cls =
    kind === "bank"
      ? "bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] text-[color-mix(in_oklch,var(--primary)_70%,black)]"
      : "bg-[color-mix(in_oklch,var(--status-heads-up)_18%,transparent)] text-[color-mix(in_oklch,var(--status-heads-up)_60%,black)]";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}
    >
      {kind === "bank" ? "Bank" : "Card"}
    </span>
  );
}

function FilterPills({
  value,
  onChange,
}: {
  value: "all" | BankKind;
  onChange: (v: "all" | BankKind) => void;
}) {
  const options: { id: "all" | BankKind; label: string }[] = [
    { id: "all", label: "All" },
    { id: "bank", label: "Banks" },
    { id: "card", label: "Cards" },
  ];
  return (
    <div className="flex gap-0.5 rounded-full border border-border bg-background p-0.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CredentialForm({
  info,
  credentialId,
  initialLabel,
  isEdit,
  onClose,
  onSaved,
}: {
  info: BankProviderInfo;
  credentialId: number | null;
  initialLabel: string;
  isEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(initialLabel);
  const [savedCredentialId, setSavedCredentialId] = useState<number | null>(
    credentialId
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [requiresManualTwoFactor, setRequiresManualTwoFactor] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "testing-ok" | "testing-fail" | "saved"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setSavedCredentialId(credentialId);
  }, [credentialId]);

  useEffect(() => {
    if (!isEdit || credentialId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getIntegrationCredentials(credentialId);
        if (cancelled) return;
        if (res.credentials) setCredentials(res.credentials);
        if (res.label) setLabel(res.label);
        setRequiresManualTwoFactor(res.requiresManualTwoFactor);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, credentialId]);

  const valid =
    label.trim().length > 0 &&
    info.credentialFields.every((f) => {
    const v = credentials[f.key]?.trim() ?? "";
    if (!v) return false;
    if (f.exactLength != null && v.length !== f.exactLength) return false;
    return true;
    });

  const saveOptions = (id: number | null) => ({
    label: label.trim(),
    ...(id != null ? { credentialId: id } : {}),
    requiresManualTwoFactor,
  });

  const handleTest = async () => {
    setTesting(true);
    setStatus("idle");
    setErrorMsg(null);
    try {
      const existingId = savedCredentialId;
      let testId = existingId;
      if (existingId != null) {
        const saved = await saveBankCredentials(
          info.id,
          credentials,
          saveOptions(existingId)
        );
        testId = saved.credentialId;
        setSavedCredentialId(testId);
      }
      const res = await testBankConnection(info.id, {
        ...(testId != null ? { credentialId: testId } : { credentials }),
      });
      if (res.success) {
        setStatus("testing-ok");
      } else {
        setStatus("testing-fail");
        setErrorMsg(res.message);
      }
    } catch {
      setStatus("testing-fail");
      setErrorMsg("Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveBankCredentials(
        info.id,
        credentials,
        saveOptions(savedCredentialId)
      );
      setSavedCredentialId(saved.credentialId);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setStatus("saved");
      setTimeout(onSaved, 500);
    } catch {
      setStatus("testing-fail");
      setErrorMsg("Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-6 text-start shadow-sm">
      <div className="mb-5 flex items-center gap-3 border-b border-border/60 pb-4">
        <ProviderBadge
          color={info.color}
          name={info.name}
          domain={info.domain}
          size={44}
          radius={11}
        />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-xl leading-tight tracking-tight">
            {info.name}
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {info.kind === "bank" ? "Bank" : "Credit cards"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        >
          ✕
        </button>
      </div>

      {!loaded ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Loading current values...
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${info.id}-label`}>Account label</Label>
            <Input
              id={`${info.id}-label`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`e.g. Personal card, ${info.name} (2)`}
            />
          </div>
          {info.credentialFields.map((field) => {
            const value = credentials[field.key] ?? "";
            const tooShort =
              field.exactLength != null &&
              value.length > 0 &&
              value.length !== field.exactLength;
            return (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label
                    htmlFor={`${info.id}-${field.key}`}
                    className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground"
                  >
                    {field.label}
                  </Label>
                  {field.maxLength && (
                    <span className="text-[10px] text-muted-foreground">
                      {value.length}/{field.maxLength}
                    </span>
                  )}
                </div>
                <Input
                  id={`${info.id}-${field.key}`}
                  type={field.type}
                  inputMode={field.numeric ? "numeric" : undefined}
                  pattern={field.numeric ? "[0-9]*" : undefined}
                  maxLength={field.maxLength ?? field.exactLength ?? undefined}
                  value={value}
                  onChange={(e) => {
                    let next = e.target.value;
                    if (field.numeric) next = next.replace(/\D/g, "");
                    if (field.exactLength)
                      next = next.slice(0, field.exactLength);
                    if (field.maxLength) next = next.slice(0, field.maxLength);
                    setCredentials((prev) => ({
                      ...prev,
                      [field.key]: next,
                    }));
                  }}
                  placeholder={field.placeholder ?? field.label}
                  className={field.numeric ? "font-mono" : undefined}
                />
                {field.hint && (
                  <p className="text-[11px] text-muted-foreground">
                    {field.hint}
                  </p>
                )}
                {tooShort && (
                  <p className="text-[11px] text-destructive">
                    Must be exactly {field.exactLength} digits.
                  </p>
                )}
              </div>
            );
          })}

          <TwoFactorSection
            info={info}
            requiresManualTwoFactor={requiresManualTwoFactor}
            onChangeManualFlag={setRequiresManualTwoFactor}
          />

          <AnimatePresence>
            {status === "testing-ok" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary"
              >
                ✓ Connection works. Click save to finish.
              </motion.div>
            )}
            {status === "testing-fail" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {errorMsg}
              </motion.div>
            )}
            {status === "saved" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary"
              >
                ✓ Saved
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={!valid || testing || saving}
              className="flex-1 rounded-full"
            >
              {testing ? "Testing..." : "Test connection"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!valid || saving}
              className="flex-1 rounded-full"
            >
              {saving ? "Saving..." : isEdit ? "Save changes" : "Save & continue"}
            </Button>
          </div>

          <div className="mt-2 flex items-start gap-2 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            <span>🔐</span>
            <span>
              AES-256-GCM · stored on this machine only. Never sent to a server.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CsvImportSubview({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const result = await importCsv(file);
      toast.success(
        `Imported ${result.added} transactions (${result.updated} updated, ${result.skipped} skipped)`
      );
      onImported();
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Import failed";
      try { msg = (JSON.parse(msg) as { error?: string }).error ?? msg; } catch { /* plain text */ }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-6 text-start shadow-sm space-y-4">
      <div
        className={[
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/30",
        ].join(" ")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) setFile(dropped);
        }}
        onClick={() => !file && fileInputRef.current?.click()}
        style={{ cursor: file ? "default" : "pointer" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = "";
          }}
        />
        {file ? (
          <div className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">{file.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Drop your CSV file here</p>
              <p className="text-xs text-muted-foreground">or click to browse &middot; .csv files only</p>
            </div>
          </>
        )}
      </div>

      <Button
        className="w-full rounded-full"
        disabled={!file || loading}
        onClick={handleImport}
      >
        {loading ? "Importing..." : "Import transactions"}
      </Button>

      <div className="flex items-start gap-2 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
        <span>ℹ️</span>
        <span>
          Transactions are stored locally. You can also connect a bank account
          above to enable automatic syncing.
        </span>
      </div>
    </div>
  );
}

function RemoveButton({
  credentialId,
  onRemoved,
}: {
  credentialId: number;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
      >
        Remove
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={async () => {
          setRemoving(true);
          await deleteIntegration(credentialId);
          setRemoving(false);
          onRemoved();
        }}
        disabled={removing}
        className="rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground"
      >
        {removing ? "..." : "Confirm"}
      </button>
    </div>
  );
}
