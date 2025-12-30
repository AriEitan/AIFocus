import React, { useMemo, useState } from "react";
import { api } from "../api";

type Msg = { role: "user" | "assistant"; text: string };

export default function Chat() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState<string>("");

  const chips = useMemo(
    () => [
      "מה ההחלטות הכי חדשות בפרויקט?",
      "מה סטטוס המשימות נכון לתאריך הכי חדש?",
      "סכם לי את 3 המסמכים האחרונים",
      "איפה יש סתירות בין מסמכים, ותעדיף את התאריך הכי חדש"
    ],
    []
  );

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;

    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setStatus("חושב...");

    try {
      const res = await api.chat(t);
      const cite = (res.citations || [])
        .slice(0, 6)
        .map((c) => `• ${c.name} (${c.date})`)
        .join("\n");

      const tail = cite ? `\n\nמקורות:\n${cite}` : "";
      setMsgs((m) => [...m, { role: "assistant", text: `${res.answer}${tail}` }]);
      setStatus(res.openai_ok ? "OpenAI: OK" : "OpenAI: fallback");
    } catch (err: any) {
      setStatus(`שגיאה: ${err?.message || "unknown"}`);
      setMsgs((m) => [...m, { role: "assistant", text: "משהו השתבש. נסה שוב בעוד רגע." }]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-white border rounded-2xl p-4 shadow-sm">
        <div className="text-lg font-semibold">צ׳אט</div>
        <div className="text-sm text-gray-600 mt-1">תשובות עם מקורות, ונעדיף תמיד את התאריך הכי חדש.</div>

        <div className="flex flex-wrap gap-2 mt-3">
          {chips.map((c) => (
            <button
              key={c}
              className="text-xs bg-gray-100 border rounded-full px-3 py-1"
              onClick={() => send(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-3 shadow-sm space-y-2">
        {msgs.length === 0 && <div className="text-sm text-gray-500">שאל שאלה כדי להתחיל.</div>}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-right"}>
            <div
              className={
                "inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm " +
                (m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900")
              }
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border rounded-2xl p-3 shadow-sm">
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="כתוב שאלה..."
          />
          <button onClick={() => send(input)} className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium">
            שלח
          </button>
        </div>
        {status && <div className="mt-2 text-xs text-gray-500">{status}</div>}
      </div>
    </div>
  );
}
