import React, { useState } from "react";
import { api, setToken } from "../api";

export default function Login(props: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [status, setStatus] = useState<string>("");

  const quickLogin = async () => {
    setStatus("מתחבר...");
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      setStatus("התחברת בהצלחה");
      props.onLoggedIn();
    } catch (err: any) {
      setStatus(`שגיאה: ${err?.message || "unknown"}`);
    }
  };

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="text-lg font-semibold mb-2">התחברות</div>
      <div className="text-sm text-gray-600 mb-4">Quick login חייב לבצע התחברות אמיתית ולשמור טוקן</div>

      <label className="block text-sm mb-1">שם משתמש</label>
      <input
        className="w-full border rounded-xl px-3 py-2 mb-3"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <label className="block text-sm mb-1">סיסמה</label>
      <input
        type="password"
        className="w-full border rounded-xl px-3 py-2 mb-4"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={quickLogin} className="w-full bg-blue-600 text-white rounded-xl py-2 font-medium">
        Quick login
      </button>

      {status && <div className="mt-3 text-sm text-gray-700">{status}</div>}
    </div>
  );
}
