import { redirect } from "next/navigation";
import { currentSession } from "@/lib/currentUser";
import { isSheetConfigured, sheetSetupHint, sheetTab, sheetUrl } from "@/lib/googleSheets";
import { isBackupConfigured } from "@/lib/backup";
import BackupClient from "./BackupClient";

export const metadata = { title: "Backups — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const session = await currentSession();
  if (!session) redirect("/login?next=/admin/backup");
  if (session.role !== "admin") redirect("/");

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Backups</h1>
        <p>Where the portal&rsquo;s data is kept, and the copies of it.</p>
      </div>
      <BackupClient
        sheetConfigured={isSheetConfigured()}
        sheetHint={sheetSetupHint()}
        sheetUrl={sheetUrl()}
        registerTab={sheetTab()}
        pcConfigured={isBackupConfigured()}
      />
    </div>
  );
}
