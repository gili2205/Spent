import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { parseCsvImport } from "@/server/lib/csv-import";
import {
  createSyncRun,
  completeSyncRun,
  failSyncRun,
} from "@/server/db/queries/sync-runs";
import { insertTransactions } from "@/server/db/queries/transactions";

export async function POST(req: Request) {
  let syncRunId: number | null = null;
  let workspaceId: number;

  try {
    workspaceId = getWorkspaceIdFromRequest(req);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Workspace error" },
      { status: 400 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const accountHint = (formData.get("accountNumber") as string | null)?.trim() || undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = parseCsvImport(text, accountHint);

    const today = new Date().toISOString().slice(0, 10);
    syncRunId = createSyncRun(workspaceId, "csv-import", null, today);

    const { added, updated } = insertTransactions(
      workspaceId,
      parsed.transactions,
      "csv-import",
      null,
      syncRunId
    );

    completeSyncRun(syncRunId, added, updated);

    return NextResponse.json({
      added,
      updated,
      skipped: parsed.skipped,
      format: parsed.format,
      accountNumber: parsed.accountNumber,
    });
  } catch (err) {
    if (syncRunId !== null) {
      try {
        failSyncRun(syncRunId, err instanceof Error ? err.message : "Unknown error");
      } catch {
        // ignore secondary failure
      }
    }
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
