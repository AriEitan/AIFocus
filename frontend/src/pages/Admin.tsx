import React, { useEffect, useState } from "react";
import { api } from "../api";

type DocRow = {
  id: number;
  name: string;
  source: string;
  date: string;
  created_at: string | null;
};

export default function Admin() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [status, setStatus] = useState<string>("טוען...");

  const load = async () => {
    setStatus("טוען...");
    try {
      const res = await api.listDocs();
      setDocs(res.docs || []);
      setStatus(`נטענו ${res.docs?.length || 0} מסמכים`);
    } catch (err: any) {
      setStatus(`שגיאה: ${err?.message || "unknown"}`);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-3">
      <div className="bg-white border rounded-2xl p-4 shadow-sm">
        <div className="text-lg font-semibold">אדמין</div>
        <div className="text-sm text-gray-600 mt-1">מסמכים ממוינים חדש למעלה לפי doc_date ואז created_at.</div>
        <button onClick={load} className="mt-3 bg-gray-100 border rounded-xl px-3 py-2 text-sm">
          רענן
        </button>
        <div className="mt-2 text-xs text-gray-500">{status}</div>
      </div>

      <div className="bg-white border rounded-2xl p-3 shadow-sm">
        {docs.length === 0 && <div className="text-sm text-gray-500">אין מסמכים להצגה.</div>}
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="border rounded-xl p-3">
              <div className="text-sm font-semibold">{d.name}</div>
              <div className="text-xs text-gray-600 mt-1">
                מקור: {d.source}, תאריך: {d.date}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
