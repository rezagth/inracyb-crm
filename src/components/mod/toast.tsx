"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const Ctx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Notifications éphémères (en bas de l'écran), annoncées aux lecteurs d'écran. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3500);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {msg && <div className="toast pointer-events-auto">{msg}</div>}
      </div>
    </Ctx.Provider>
  );
}
