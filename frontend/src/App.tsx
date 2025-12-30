import React, { useEffect, useMemo, useState } from "react";
import BottomNav, { TabKey } from "./components/BottomNav";
import UploadFab from "./components/UploadFab";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import { getToken } from "./api";

export default function App() {
  const [tab, setTab] = useState<TabKey>("home");
  const [authed, setAuthed] = useState<boolean>(!!getToken());

  useEffect(() => {
    setAuthed(!!getToken());
  }, []);

  const content = useMemo(() => {
    if (!authed) {
      return <Login onLoggedIn={() => setAuthed(true)} />;
    }
    if (tab === "home") return <Home />;
    if (tab === "chat") return <Chat />;
    return <Admin />;
  }, [tab, authed]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-md min-h-screen flex flex-col">
        <header className="px-4 py-4 bg-white shadow-sm">
          <div className="text-xl font-semibold">FocusAI</div>
          <div className="text-sm text-gray-500">מערכת מודיעין פרויקט, מסך הבית הוא הדשבורד</div>
        </header>

        <main className="flex-1 p-4 pb-24">{content}</main>

        {authed && <UploadFab onUploaded={() => {}} />}

        {authed && <BottomNav tab={tab} onChange={setTab} />}
      </div>
    </div>
  );
}
