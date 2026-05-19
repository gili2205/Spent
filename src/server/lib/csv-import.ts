import "server-only";

export type BankFormat = "hapoalim" | "isracard" | "max";

export interface CsvTransaction {
  accountNumber: string;
  date: string;
  processedDate: string;
  description: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string;
  memo?: string;
  identifier?: string;
  type: "normal" | "installments";
  status: "completed";
  installmentNumber?: number;
  installmentTotal?: number;
}

export interface CsvParseResult {
  transactions: CsvTransaction[];
  format: BankFormat;
  accountNumber: string;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function stripBom(text: string): string {
  return text.startsWith("﻿") ? text.slice(1) : text;
}

function parseIsraeliDate(raw: string): string | null {
  const s = raw.trim();
  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const [, d, mo, y] = m1;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function parseAmount(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;
  // Strip currency symbols, spaces, and thousand-separator commas like 1,234.56
  let s = raw.replace(/[₪$€£\s]/g, "");
  // If there is exactly one comma and it looks like a decimal separator
  // (e.g. "150,00" or "1.234,56"), convert to dot-decimal
  if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else {
    // Remove thousand-separator commas before an optional decimal part
    s = s.replace(/,(?=\d{3}(?:[.,]|$))/g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Minimal CSV line parser (handles double-quoted fields with embedded commas)
function parseLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function normalizeHeader(h: string): string {
  return h.replace(/"/g, "").trim();
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function detectFormat(headers: string[]): BankFormat | null {
  const hs = new Set(headers.map(normalizeHeader));
  // Max: has both תאריך עסקה and תאריך חיוב
  if (hs.has("תאריך עסקה") && hs.has("תאריך חיוב")) return "max";
  // Isracard: has תאריך רכישה
  if (hs.has("תאריך רכישה")) return "isracard";
  // Hapoalim: has תיאור פעולה or (חובה + זכות)
  if (hs.has("תיאור פעולה") || (hs.has("חובה") && hs.has("זכות"))) return "hapoalim";
  return null;
}

// ---------------------------------------------------------------------------
// Per-bank parsers
// ---------------------------------------------------------------------------

function parseHapoalim(
  headers: string[],
  rows: string[][],
  fallbackAccount: string
): { txns: CsvTransaction[]; account: string; skipped: number } {
  const h = headers.map(normalizeHeader);
  const idx = (name: string) => h.indexOf(name);

  const iDate = idx("תאריך ערך");
  const iDateEff = idx("תאריך אפקטיבי");
  const iDesc = idx("תיאור פעולה");
  const iDescAlt = idx("תיאור");
  const iDebit = idx("חובה");
  const iCredit = idx("זכות");
  const iRef = idx("אסמכתא");

  const descIdx = iDesc !== -1 ? iDesc : iDescAlt;
  if (iDate === -1 || descIdx === -1 || iDebit === -1 || iCredit === -1) {
    return { txns: [], account: fallbackAccount, skipped: rows.length };
  }

  const txns: CsvTransaction[] = [];
  let skipped = 0;

  for (const row of rows) {
    const rawDate = row[iDate] ?? "";
    const date = parseIsraeliDate(rawDate);
    if (!date) { skipped++; continue; }

    const processedDate =
      iDateEff !== -1 ? (parseIsraeliDate(row[iDateEff] ?? "") ?? date) : date;
    const description = row[descIdx]?.trim();
    if (!description) { skipped++; continue; }

    const debit = parseAmount(row[iDebit] ?? "");
    const credit = parseAmount(row[iCredit] ?? "");
    if (debit == null && credit == null) { skipped++; continue; }

    // Debit = money going out (negative), Credit = money coming in (positive)
    const chargedAmount = credit != null ? credit : -(debit!);
    const identifier = iRef !== -1 ? row[iRef]?.trim() || undefined : undefined;

    txns.push({
      accountNumber: fallbackAccount,
      date,
      processedDate,
      description,
      originalAmount: chargedAmount,
      originalCurrency: "ILS",
      chargedAmount,
      chargedCurrency: "ILS",
      identifier,
      type: "normal",
      status: "completed",
    });
  }

  return { txns, account: fallbackAccount, skipped };
}

function parseIsracard(
  headers: string[],
  rows: string[][],
  fallbackAccount: string
): { txns: CsvTransaction[]; account: string; skipped: number } {
  const h = headers.map(normalizeHeader);
  const idx = (name: string) => h.indexOf(name);

  const iDate = idx("תאריך רכישה");
  const iDesc = idx("שם בית עסק");
  const iOrigAmt = idx("סכום עסקה");
  const iOrigCur = idx("מטבע");
  const iChargedAmt = idx("סכום חיוב");
  const iCard = idx("4 ספרות אחרונות של כרטיס");
  const iNotes = idx("הערות");

  if (iDate === -1 || iDesc === -1 || iOrigAmt === -1) {
    return { txns: [], account: fallbackAccount, skipped: rows.length };
  }

  const txns: CsvTransaction[] = [];
  let skipped = 0;
  let detectedAccount = fallbackAccount;

  for (const row of rows) {
    const rawDate = row[iDate] ?? "";
    const date = parseIsraeliDate(rawDate);
    if (!date) { skipped++; continue; }

    const description = row[iDesc]?.trim();
    if (!description) { skipped++; continue; }

    const origAmt = parseAmount(row[iOrigAmt] ?? "");
    if (origAmt == null) { skipped++; continue; }

    const origCur = iOrigCur !== -1 ? (row[iOrigCur]?.trim() || "ILS") : "ILS";
    const chargedAmt =
      iChargedAmt !== -1 ? (parseAmount(row[iChargedAmt] ?? "") ?? -origAmt) : -origAmt;

    const cardDigits = iCard !== -1 ? row[iCard]?.trim() : undefined;
    if (cardDigits && cardDigits !== detectedAccount) {
      detectedAccount = cardDigits;
    }

    const memo = iNotes !== -1 ? row[iNotes]?.trim() || undefined : undefined;

    // Isracard amounts are positive numbers representing charges; negate to expense
    txns.push({
      accountNumber: cardDigits || fallbackAccount,
      date,
      processedDate: date,
      description,
      originalAmount: -origAmt,
      originalCurrency: origCur,
      chargedAmount: -Math.abs(chargedAmt),
      chargedCurrency: "ILS",
      memo,
      type: "normal",
      status: "completed",
    });
  }

  return { txns, account: detectedAccount, skipped };
}

function parseMax(
  headers: string[],
  rows: string[][],
  fallbackAccount: string
): { txns: CsvTransaction[]; account: string; skipped: number } {
  const h = headers.map(normalizeHeader);
  const idx = (name: string) => h.indexOf(name);

  const iTxDate = idx("תאריך עסקה");
  const iBillDate = idx("תאריך חיוב");
  const iDesc = idx("שם בית עסק");
  const iOrigAmt = idx("סכום עסקה");
  const iOrigCur = idx("מטבע עסקה");
  const iChargedAmt = idx("סכום חיוב");
  const iChargedCur = idx("מטבע חיוב");
  const iCard = idx("4 ספרות אחרונות של כרטיס");
  const iNotes = idx("הערות");

  if (iTxDate === -1 || iDesc === -1 || iOrigAmt === -1) {
    return { txns: [], account: fallbackAccount, skipped: rows.length };
  }

  const txns: CsvTransaction[] = [];
  let skipped = 0;
  let detectedAccount = fallbackAccount;

  for (const row of rows) {
    const rawDate = row[iTxDate] ?? "";
    const date = parseIsraeliDate(rawDate);
    if (!date) { skipped++; continue; }

    const processedDate =
      iBillDate !== -1 ? (parseIsraeliDate(row[iBillDate] ?? "") ?? date) : date;
    const description = row[iDesc]?.trim();
    if (!description) { skipped++; continue; }

    const origAmt = parseAmount(row[iOrigAmt] ?? "");
    if (origAmt == null) { skipped++; continue; }

    const origCur = iOrigCur !== -1 ? (row[iOrigCur]?.trim() || "ILS") : "ILS";
    const chargedAmt =
      iChargedAmt !== -1 ? (parseAmount(row[iChargedAmt] ?? "") ?? origAmt) : origAmt;
    const chargedCur =
      iChargedCur !== -1 ? (row[iChargedCur]?.trim() || "ILS") : "ILS";

    const cardDigits = iCard !== -1 ? row[iCard]?.trim() : undefined;
    if (cardDigits && cardDigits !== detectedAccount) {
      detectedAccount = cardDigits;
    }

    const memo = iNotes !== -1 ? row[iNotes]?.trim() || undefined : undefined;

    txns.push({
      accountNumber: cardDigits || fallbackAccount,
      date,
      processedDate,
      description,
      originalAmount: -origAmt,
      originalCurrency: origCur,
      chargedAmount: -Math.abs(chargedAmt),
      chargedCurrency: chargedCur,
      memo,
      type: "normal",
      status: "completed",
    });
  }

  return { txns, account: detectedAccount, skipped };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function parseCsvImport(
  rawText: string,
  fallbackAccount = "csv"
): CsvParseResult {
  const text = stripBom(rawText);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");

  // Find the header row: first line where detectFormat returns non-null
  let headerIdx = -1;
  let format: BankFormat | null = null;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cols = parseLine(lines[i]);
    format = detectFormat(cols);
    if (format) { headerIdx = i; break; }
  }

  if (headerIdx === -1 || format === null) {
    throw new Error(
      "Unrecognized CSV format. Supported banks: Bank Hapoalim, Isracard, Max."
    );
  }

  const headers = parseLine(lines[headerIdx]);
  const dataRows = lines
    .slice(headerIdx + 1)
    .map(parseLine)
    .filter((r) => r.some((c) => c !== ""));

  let result: { txns: CsvTransaction[]; account: string; skipped: number };
  if (format === "hapoalim") {
    result = parseHapoalim(headers, dataRows, fallbackAccount);
  } else if (format === "isracard") {
    result = parseIsracard(headers, dataRows, fallbackAccount);
  } else {
    result = parseMax(headers, dataRows, fallbackAccount);
  }

  if (result.txns.length === 0 && dataRows.length > 0) {
    throw new Error(
      `Detected format "${format}" but could not parse any transactions. Check that the file is not empty and has the expected columns.`
    );
  }

  return {
    transactions: result.txns,
    format,
    accountNumber: result.account,
    skipped: result.skipped,
  };
}
