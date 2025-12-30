import React, { useEffect, useMemo, useState } from "react";
import { api, DocItem, AdminStats } from "../api";

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
  if (ext === "msg") return "MSG";
  if (ext === "eml") return "EML";
  if (ext === "rtf") return "RTF";
  if (ext === "csv") return "CSV";
  if (ext === "txt") return "TXT";
  if (ext === "md") return "MD";
  if (ext === "json") return "JSON";
  if (["png", "jpg", "jpeg", "webp", "gif", "tiff", "bmp", "heic", "heif"].includes(ext)) return "IMG";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "ZIP";
  if (["dwg", "dxf"].includes(ext)) return "DWG";
  if (ext === "no_ext") return "NO_EXT";
  return "OTHER";
}

function BarRow(props: { label: string; value: number; max: number }) {
  const pct = props.max === 0 ? 0 : Math.round((props.value / props.max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-700">
        <div>{props.label}</div>
        <div>{props.value}</div>
      </div>
      <div className="w-full bg-gray-200 rounded h-2">
        <div className="bg-blue-600 h-2 rounded" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Home() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const refresh = async () => {
    setLoading(true);
    setErr("");
    try {
      const [items, s] = await Promise.all([api.getDocs(), api.getStats()]);
      setDocs(Array.isArray(items) ? items : []);
      setStats(s || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load dashboard");
      setDocs([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const computed = useMemo(() => {
    const safeDocs = Array.isArray(docs) ? docs : [];

    const bySource: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byExtRaw: Record<string, number> = {};

    for (const d of safeDocs) {
      const src = (d?.source || "Unknown").toString();
      bySource[src] = (bySource[src] || 0) + 1;

      const ext = extOf(d?.name || "");
      byExtRaw[ext] = (byExtRaw[ext] || 0) + 1;

      const bucket = typeBucket(ext);
      byType[bucket] = (byType[bucket] || 0) + 1;
    }

    const maxSource = Math.max(0, ...Object.values(bySource));
    const maxType = Math.max(0, ...Object.values(byType));

    const newest = [...safeDocs]
      .sort((a, b) => {
        const ad = a?.doc_date || "";
        const bd = b?.doc_date || "";
        if (ad !== bd) return bd.localeCompare(ad);
        const ac = a?.created_at || "";
        const bc = b?.created_at || "";
        return bc.localeCompare(ac);
      })
      .slice(0, 8);

    const otherCount = byType["OTHER"] || 0;
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

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <div className="text-xs text-gray-600">מסמכים סה״כ</div>
          <div className="text-2xl font-bold">{totalDocs}</div>
        </div>

        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <div className="text-xs text-gray-600">מיילים נותחו (סה״כ)</div>
          <div className="text-2xl font-bold">{emailsBodies}</div>
        </div>

        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <div className="text-xs text-gray-600">מיילים ב־24 שעות</div>
          <div className="text-2xl font-bold">{emailsLast24}</div>
        </div>

        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <div className="text-xs text-gray-600">מצב מערכת</div>
          <div className="text-sm text-gray-800">{loading ? "טוען..." : "מוכן"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <div className="text-xs text-gray-600">קבצים שהועלו ידנית</div>
          <div className="text-2xl font-bold">{uploadedManual}</div>
        </div>

        <div className="bg-white border rounded-2xl p-3 shadow-sm">
          <div className="text-xs text-gray-600">קבצים שחולצו ממיילים</div>
          <div className="text-2xl font-bold">{emailAttachments}</div>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-3 shadow-sm space-y-3">
        <div className="text-sm font-semibold">מקורות</div>
        {sourceEntries.length === 0 ? (
          <div className="text-sm text-gray-600">אין נתונים עדיין</div>
        ) : (
          <div className="space-y-3">
            {sourceEntries
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => <BarRow key={k} label={k} value={v} max={computed.maxSource} />)}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-2xl p-3 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">סוגי קבצים</div>
          <div className="text-xs text-gray-600">
            OTHER: {computed.otherCount} | NO_EXT: {computed.noExtCount}
          </div>
        </div>

        {typeEntries.length === 0 ? (
          <div className="text-sm text-gray-600">אין נתונים עדיין</div>
        ) : (
          <div className="space-y-3">
            {typeEntries
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => <BarRow key={k} label={k} value={v} max={computed.maxType} />)}
          </div>
        )}

        {computed.otherCount > 0 && (
          <div className="mt-2 text-xs text-gray-700">
            <div className="font-semibold mb-1">סיומות שמסתתרות בתוך OTHER (Top):</div>
            {computed.topOtherExts.length === 0 ? (
              <div>אין</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {computed.topOtherExts.map(([ext, count]) => (
                  <span key={ext} className="px-2 py-1 border rounded bg-gray-50">
                    {ext}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-2xl p-3 shadow-sm space-y-3">
        <div className="text-sm font-semibold">מסמכים אחרונים</div>
        {computed.newest.length === 0 ? (
          <div className="text-sm text-gray-600">עדיין אין מסמכים</div>
        ) : (
          <div className="space-y-2">
            {computed.newest.map((d) => (
              <div key={String(d.id)} className="border rounded-xl p-2">
                <div className="text-sm font-medium truncate" title={d.name}>
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
