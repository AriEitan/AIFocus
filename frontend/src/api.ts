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
  doc_date?: string;
  source?: string;
  source_kind?: string;
};

export type UploadResponse = {
  ok: boolean;
  items: UploadIngestedItem[];
};

export type ChatResponse = {
  answer: string;
  openai_ok: boolean;
  citations: { name: string; date: string }[];
};

export type AdminStats = {
  total_docs: number;
  uploaded_manual: number;
  emails_bodies: number;
  email_attachments: number;
  emails_ingested_last_24h: number;
};

export type EmailStatus = {
  ok: boolean | null;
  last_attempt_utc: string | null;
  last_success_utc: string | null;
  last_error: string | null;
  last_unseen_count: number | null;
  last_ingested_count: number | null;
};

export type EmailPollNowResponse =
  | { ok: true; unseen: number; ingested: number }
  | { ok: false; error?: string };

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

function authHeaders(extra?: Record<string, string>) {
  const t = getToken();
  return {
    ...(extra || {}),
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

async function requestAny(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: authHeaders(init?.headers as any),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `HTTP ${res.status}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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

  getEmailStatus: async (): Promise<EmailStatus> => {
    const data: any = await requestAny("/admin/email/status");
    return {
      ok: (data?.ok ?? null) as any,
      last_attempt_utc: data?.last_attempt_utc ?? null,
      last_success_utc: data?.last_success_utc ?? null,
      last_error: data?.last_error ?? null,
      last_unseen_count: data?.last_unseen_count ?? null,
      last_ingested_count: data?.last_ingested_count ?? null,
    };
  },

  emailPollNow: async (): Promise<EmailPollNowResponse> => {
    const data: any = await requestAny("/admin/email/poll-now", { method: "POST" });
    if (data?.ok === true) {
      return { ok: true, unseen: Number(data?.unseen || 0), ingested: Number(data?.ingested || 0) };
    }
    return { ok: false, error: data?.error || "poll failed" };
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
