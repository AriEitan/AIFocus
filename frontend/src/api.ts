// frontend/src/api.ts

export type LoginResponse = { token: string };

export type DocItem = {
  id: number | string;
  name: string;
  source: "Upload" | "Email" | string;
  source_kind?: "upload" | "email_body" | "email_attachment" | string;
  doc_date: string; // YYYY-MM-DD
  created_at?: string;
};

export type UploadIngestedItem = {
  name: string;
  id: number | string;
  source: string;
  date: string;
  parsed: boolean;
  embedded: "ok" | "disabled" | "failed";
  error: string | null;
};

export type UploadResponse = {
  ok: boolean;
  ingested: UploadIngestedItem[];
};

export type ChatResponse = {
  mode: "openai" | "fallback";
  openai_ok: boolean;
  openai_error?: string;
  answer: string;
  citations: { name: string; date: string }[];
};

export type AdminStats = {
  total_docs: number;
  uploaded_manual: number;
  emails_bodies: number;
  email_attachments: number;
  emails_ingested_last_24h: number;
};

const API_BASE = "/api";
const TOKEN_KEY = "token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function requestAny(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { ...(opts.headers as any) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    let body = "";
    try {
      body = isJson ? JSON.stringify(await res.json()) : await res.text();
    } catch {
      body = "";
    }
    throw new Error(body || `HTTP ${res.status}`);
  }

  if (!isJson) {
    const text = await res.text();
    if (text.trim().startsWith("<")) throw new Error(text);
    throw new Error("Non-JSON response from server");
  }

  return await res.json();
}

function normalizeDocs(data: any): DocItem[] {
  const arr =
    Array.isArray(data) ? data :
    Array.isArray(data?.docs) ? data.docs :
    Array.isArray(data?.items) ? data.items :
    Array.isArray(data?.data) ? data.data :
    [];

  return arr
    .filter((x: any) => x && (x.name || x.filename))
    .map((x: any) => ({
      id: x.id ?? x.doc_id ?? x.uuid ?? x.name,
      name: x.name ?? x.filename ?? "unknown",
      source: x.source ?? x.origin ?? "Unknown",
      source_kind: x.source_kind ?? x.kind ?? undefined,
      doc_date: x.doc_date ?? x.date ?? "",
      created_at: x.created_at ?? x.createdAt,
    }));
}

export const api = {
  health: async (): Promise<{ ok: boolean }> => requestAny("/health"),

  login: async (username: string, password: string): Promise<LoginResponse> =>
    requestAny("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),

  getDocs: async (): Promise<DocItem[]> => {
    const data = await requestAny("/admin/docs");
    return normalizeDocs(data);
  },

  // backward compatibility
  listDocs: async (): Promise<DocItem[]> => {
    const data = await requestAny("/admin/docs");
    return normalizeDocs(data);
  },

  getStats: async (): Promise<AdminStats> => {
    const data: any = await requestAny("/admin/stats");
    return {
      total_docs: Number(data?.total_docs || 0),
      uploaded_manual: Number(data?.uploaded_manual || 0),
      emails_bodies: Number(data?.emails_bodies || 0),
      email_attachments: Number(data?.email_attachments || 0),
      emails_ingested_last_24h: Number(data?.emails_ingested_last_24h || 0),
    };
  },

  upload: async (files: File[]): Promise<UploadResponse> => {
    const fd = new FormData();
    for (const f of files) {
      const anyF: any = f as any;
      const relPath = (anyF?.webkitRelativePath || "").trim();
      const uploadName = relPath ? relPath : f.name;
      fd.append("files", f, uploadName);
    }
    return requestAny("/ingest/upload", { method: "POST", body: fd });
  },

  chat: async (message: string): Promise<ChatResponse> =>
    requestAny("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }),
};
