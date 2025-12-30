import React, { useRef, useState } from "react";
import { api, UploadResponse } from "../api";

type FileState = {
  file: File;
  uploadName: string; // name שאנחנו שולחים לשרת, כולל relative path לתיקיות
  status: "pending" | "uploading" | "done" | "error";
  parsed?: boolean;
  embedded?: "ok" | "disabled" | "failed";
  error?: string;
};

const BATCH_SIZE = 5;

function getUploadName(f: File): string {
  const anyF: any = f as any;
  const rel = (anyF?.webkitRelativePath || "").trim();
  return rel ? rel : f.name;
}

function summarizeBatchResult(res: UploadResponse): Record<string, { parsed: boolean; embedded: any; error: string | null }> {
  const map: Record<string, any> = {};
  for (const it of res.ingested || []) {
    map[it.name] = { parsed: it.parsed, embedded: it.embedded, error: it.error };
  }
  return map;
}

export default function UploadFab(props: { onUploaded: () => void }) {
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [queue, setQueue] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);

  const pickFiles = () => {
    if (busy) return;
    filesInputRef.current?.click();
  };

  const pickFolder = () => {
    if (busy) return;
    folderInputRef.current?.click();
  };

  const enqueueFiles = async (files: File[]) => {
    const newItems: FileState[] = files.map((f) => ({
      file: f,
      uploadName: getUploadName(f),
      status: "pending",
    }));

    const nextQueue = [...queue, ...newItems];
    setQueue(nextQueue);

    // אם כבר רץ upload, רק נצרף לתור
    if (!busy) await processQueue(nextQueue);
  };

  const processQueue = async (initialQueue: FileState[]) => {
    if (busy) return;
    setBusy(true);

    let q = [...initialQueue];

    const pendingIndexes = () => q.map((x, idx) => ({ x, idx })).filter((p) => p.x.status === "pending");

    while (pendingIndexes().length > 0) {
      const batchIdx = pendingIndexes()
        .slice(0, BATCH_SIZE)
        .map((p) => p.idx);

      // mark uploading
      q = q.map((item, idx) =>
        batchIdx.includes(idx) ? { ...item, status: "uploading", error: undefined } : item
      );
      setQueue([...q]);

      const batchFiles = batchIdx.map((idx) => q[idx].file);

      try {
        const res = await api.upload(batchFiles);
        const lookup = summarizeBatchResult(res);

        q = q.map((item, idx) => {
          if (!batchIdx.includes(idx)) return item;

          const result = lookup[item.uploadName] || lookup[item.file.name]; // fallback
          if (!result) {
            return { ...item, status: "error", error: "Missing per-file status from server" };
          }

          const isOk = result.parsed === true;
          return {
            ...item,
            status: isOk ? "done" : "error",
            parsed: result.parsed,
            embedded: result.embedded,
            error: result.error || undefined,
          };
        });

        setQueue([...q]);
      } catch (err: any) {
        const msg = err?.message || "unknown error";
        q = q.map((item, idx) =>
          batchIdx.includes(idx) ? { ...item, status: "error", error: msg } : item
        );
        setQueue([...q]);
      }
    }

    setBusy(false);
    props.onUploaded();
  };

  const onFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) await enqueueFiles(files);
    if (filesInputRef.current) filesInputRef.current.value = "";
  };

  const onFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) await enqueueFiles(files);
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const doneCount = queue.filter((f) => f.status === "done").length;
  const errorCount = queue.filter((f) => f.status === "error").length;
  const total = queue.length || 1;
  const progress = Math.round((doneCount / total) * 100);

  const clearIfNotBusy = () => {
    if (busy) return;
    setQueue([]);
  };

  return (
    <>
      <input ref={filesInputRef} type="file" multiple className="hidden" onChange={onFilesChange} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onFolderChange}
        {...({ webkitdirectory: "", directory: "" } as any)}
      />

      {/* FABs */}
      <div className="fixed bottom-20 left-4 flex flex-col gap-2">
        <button
          onClick={pickFiles}
          disabled={busy}
          className={"bg-blue-600 text-white rounded-full w-14 h-14 shadow text-2xl " + (busy ? "opacity-60" : "")}
          aria-label="Upload files"
          title="העלה קבצים"
        >
          +
        </button>

        <button
          onClick={pickFolder}
          disabled={busy}
          className={"bg-white border rounded-full w-14 h-14 text-xs " + (busy ? "opacity-60" : "")}
          aria-label="Upload folder"
          title="העלה תיקייה"
        >
          תיקייה
        </button>
      </div>

      {/* Upload Panel */}
      {queue.length > 0 && (
        <div className="fixed bottom-36 left-4 right-4 max-w-md mx-auto bg-white border rounded-xl p-3 shadow space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">העלאת קבצים</div>
            <button
              className={"text-xs px-2 py-1 border rounded " + (busy ? "opacity-50" : "")}
              onClick={clearIfNotBusy}
              disabled={busy}
              title="נקה רשימה"
            >
              נקה
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded h-2">
            <div className="bg-blue-600 h-2 rounded" style={{ width: `${progress}%` }} />
          </div>

          <div className="flex justify-between text-xs text-gray-700">
            <div>{progress}%</div>
            <div>הושלמו: {doneCount}, שגיאות: {errorCount}</div>
          </div>

          {/* File list */}
          <div className="max-h-52 overflow-auto space-y-2">
            {queue.map((f, i) => (
              <div key={i} className="text-xs border rounded-lg p-2">
                <div className="flex justify-between gap-2">
                  <div className="truncate" title={f.uploadName}>{f.uploadName}</div>
                  <div>
                    {f.status === "pending" && "⏳"}
                    {f.status === "uploading" && "⬆️"}
                    {f.status === "done" && "✅"}
                    {f.status === "error" && "❌"}
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-700">
                  <span className="px-2 py-0.5 border rounded">parsed: {f.parsed === undefined ? "-" : f.parsed ? "yes" : "no"}</span>
                  <span className="px-2 py-0.5 border rounded">embedded: {f.embedded || "-"}</span>
                </div>

                {f.error && (
                  <div className="mt-1 text-[11px] text-red-600 whitespace-pre-wrap">
                    {f.error}
                  </div>
                )}
              </div>
            ))}
          </div>

          {busy && <div className="text-xs text-gray-600">מעלה עכשיו, אפשר להמשיך לעבוד באפליקציה</div>}
        </div>
      )}
    </>
  );
}
