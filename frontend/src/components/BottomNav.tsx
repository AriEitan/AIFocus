import React from "react";

export type TabKey = "home" | "chat" | "admin";

export default function BottomNav(props: { tab: TabKey; onChange: (t: TabKey) => void }) {
  const { tab, onChange } = props;

  const item = (key: TabKey, label: string) => {
    const active = tab === key;
    return (
      <button
        onClick={() => onChange(key)}
        className={
          "flex-1 py-3 text-sm font-medium " + (active ? "text-blue-600" : "text-gray-500")
        }
      >
        {label}
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-sm">
      <div className="mx-auto max-w-md flex">
        {item("home", "בית")}
        {item("chat", "צ׳אט")}
        {item("admin", "אדמין")}
      </div>
    </nav>
  );
}
