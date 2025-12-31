import React, { useEffect, useMemo, useState } from "react";
import { api, DocItem, AdminStats, EmailStatus } from "../api";

function extOf(name: string): string {
  const n = (name || "").toLowerCase().trim();
  const base = n.includes("/") ? n.split("/").pop() || n : n;
  const dot = base.lastIndexOf(".");
  if (dot === -1) return "no_ext";
  const ext = base.slice(dot + 1).trim();
  return ext || "no_ext";
}

function typeBucket(ext: string): string {
  if (ext === "pdf") return "PDF";
  if (ext === "docx" || ext === "doc") return "DOCX";
  if (ext === "xlsx" || ext === "xls") return "XLSX";
  if (ext === "pptx" || ext === "ppt") return "PPTX";
  if (ext === "txt" || ext === "md") return "TEXT";
  return "OTHER";
}

function fmtUtc(iso: string | null): string {
  if (!iso) return "לא ידוע";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function Home() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [pollingNow, setPollingNow] = useState(false);
  const [pollMsg, setPollMsg] = useState<string>("");

  const refresh = async () => {
    setLoading(true);
    setErr("");
    try {
      const [d, s, es] = await Promise.all([api.getDocs(), api.getStats(), api.getEmailStatus()]);
      setDocs(d);
      setStats(s);
      setEmailStatus(es);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    } finally {
      setLoading(false);
    }
  };

  const pollNow = async () => {
    setPollingNow(true);
    setPollMsg("");
    try {
      const res = await api.emailPollNow();
      if (res.ok) {
        if ((res.ingested || 0) > 0) {
          setPollMsg(`נכנסו ${res.ingested} מיילים חדשים ונוספו למערכת.`);
        } else {
          setPollMsg("אין מיילים חדשים כרגע.");
        }
      } else {
        setPollMsg(`בדיקה נכשלה. ${res.error || ""}`.trim());
      }

      await refresh();
    } catch (e: any) {
      setPollMsg(`בדיקה נכשלה. ${e?.message || "שגיאה"}`);
    } finally {
      setPollingNow(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const computed = useMemo(() => {
    const bySource: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byExtRaw: Record<string, number> = {};

    let newest: DocItem | null = null;

    for (const d of docs) {
      const src = d.source || "Unknown";
      bySource[src] = (bySource[src] || 0) + 1;

      const ext = extOf(d.name);
      byExtRaw[ext] = (byExtRaw[ext] || 0) + 1;

      const bucket = typeBucket(ext);
      byType[bucket] = (byType[bucket] || 0) + 1;

      if (!newest) newest = d;
      else {
        const a = d.created_at || d.doc_date || "";
        const b = newest.created_at || newest.doc_date || "";
        if (a > b) newest = d;
      }
    }

    const maxSource = Math.max(0, ...Object.values(bySource));
    const maxType = Math.max(0, ...Object.values(byType));

    const otherCount = (byType["OTHER"] || 0) + (byType["TEXT"] || 0);

    const topOtherExts = Object.entries(byExtRaw)
      .filter(([ext]) => typeBucket(ext) === "OTHER")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const noExtCount = byExtRaw["no_ext"] || 0;

    return { bySource, byType, maxSource, maxType, newest, otherCount, topOtherExts, noExtCount };
  }, [docs]);

  const sourceEntries = Object.entries(computed.bySource || {});
  const typeEntries = Object.entries(computed.byType || {});

  const totalDocs = stats?.total_docs ?? docs.length;
  const uploadedManual = stats?.uploaded_manual ?? (computed.bySource["Upload"] || 0);
  const emailsBodies = stats?.emails_bodies ?? 0;
  const emailAttachments = stats?.email_attachments ?? 0;
  const emailsLast24 = stats?.emails_ingested_last_24h ?? 0;

  const emailOk = emailStatus?.ok;
  const emailBadge =
    emailOk === true ? "תקין" :
    emailOk === false ? "שגיאה" :
    "לא ידוע";

  const emailBadgeClass =
    emailOk === true ? "bg-green-100 text-green-800 border-green-200" :
    emailOk === false ? "bg-red-100 text-red-800 border-red-200" :
    "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">דאשבורד פרויקט</div>
        <button className="text-sm px-3 py-1 border rounded" onClick={refresh} disabled={loading}>
          רענן
        </button>
      </div>

      {err && (
        <div className="p-3 border rounded bg-white text-sm text-red-600 whitespace-pre-wrap">
          {err}
        </div>
      )}

      {/* Email status card */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold">סטטוס חיבור מייל</div>
          <span className={`text-xs px-2 py-1 border rounded-full ${emailBadgeClass}`}>
            {emailBadge}
          </span>
        </div>

        <div className="text-sm text-gray-700 space-y-1">
          <div>
            <span className="text-gray-500">ניסיון חיבור אחרון: </span>
            <span>{fmtUtc(emailStatus?.last_attempt_utc || null)}</span>
          </div>

          <div>
            <span className="text-gray-500">חיבור תקין אחרון: </span>
            <span>{fmtUtc(emailStatus?.last_success_utc || null)}</span>
          </div>

          {emailStatus?.last_error && (
            <div className="text-red-700">
              <span className="text-gray-500">שגיאה אחרונה: </span>
              <span className="whitespace-pre-wrap">{emailStatus.last_error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="text-sm px-3 py-2 border rounded-xl"
            onClick={pollNow}
            disabled={pollingNow}
          >
            {pollingNow ? "בודק..." : "בדוק כעת"}
          </button>
          {pollMsg && <div className="text-sm text-gray-600">{pollMsg}</div>}
        </div>
      </div>

      {/* Stats card */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm">
        <div className="font-semibold mb-2">סיכום</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="border rounded-xl p-3">
            <div className="text-gray-500">סה״כ מסמכים</div>
            <div className="text-lg font-semibold">{totalDocs}</div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="text-gray-500">Upload</div>
            <div className="text-lg font-semibold">{uploadedManual}</div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="text-gray-500">Email bodies</div>
            <div className="text-lg font-semibold">{emailsBodies}</div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="text-gray-500">Email attachments</div>
            <div className="text-lg font-semibold">{emailAttachments}</div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="text-gray-500">Emails ב-24h</div>
            <div className="text-lg font-semibold">{emailsLast24}</div>
          </div>
        </div>
      </div>

      {/* Distributions */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-4">
        <div className="font-semibold">פילוחים</div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600 mb-2">לפי מקור</div>
            <div className="space-y-2">
              {sourceEntries.map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="w-28 text-sm">{k}</div>
                  <div className="flex-1 h-2 bg-gray-100 rounded">
                    <div
                      className="h-2 bg-gray-700 rounded"
                      style={{ width: computed.maxSource ? `${(v / computed.maxSource) * 100}%` : "0%" }}
                    />
                  </div>
                  <div className="w-10 text-right text-sm">{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-600 mb-2">לפי סוג קובץ</div>
            <div className="space-y-2">
              {typeEntries.map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="w-28 text-sm">{k}</div>
                  <div className="flex-1 h-2 bg-gray-100 rounded">
                    <div
                      className="h-2 bg-gray-700 rounded"
                      style={{ width: computed.maxType ? `${(v / computed.maxType) * 100}%` : "0%" }}
                    />
                  </div>
                  <div className="w-10 text-right text-sm">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {computed.topOtherExts.length > 0 && (
          <div>
            <div className="text-sm text-gray-600 mb-2">סיומות OTHER מובילות</div>
            <div className="flex flex-wrap gap-2">
              {computed.topOtherExts.map(([ext, c]) => (
                <span key={ext} className="text-xs px-2 py-1 border rounded-full bg-gray-50">
                  .{ext} ({c})
                </span>
              ))}
              {computed.noExtCount > 0 && (
                <span className="text-xs px-2 py-1 border rounded-full bg-gray-50">
                  ללא סיומת ({computed.noExtCount})
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Recent docs */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">מסמכים אחרונים</div>
          <div className="text-xs text-gray-600">
            {computed.newest ? `חדש ביותר: ${computed.newest.name}` : ""}
          </div>
        </div>

        {docs.length === 0 ? (
          <div className="text-sm text-gray-500">אין מסמכים עדיין.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {docs.slice(0, 10).map((d) => (
              <div key={String(d.id)} className="border rounded-xl p-3">
                <div className="font-medium text-sm truncate" title={d.name}>
                  {d.name}
                </div>
                <div className="text-xs text-gray-600 flex justify-between">
                  <span>{d.source}</span>
                  <span>{d.doc_date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
