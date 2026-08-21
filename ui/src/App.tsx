import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Models from "./pages/Models";
import Providers from "./pages/Providers";
import Policy from "./pages/Policy";
import Keys from "./pages/Keys";
import Traffic from "./pages/Traffic";
import Costs from "./pages/Costs";
import Logs from "./pages/Logs";
import Backups from "./pages/Backups";
import RoutingEditor from "./pages/RoutingEditor";
import SettingsPage from "./pages/Settings";
import SystemHealth from "./pages/SystemHealth";
import LiveEvents from "./pages/LiveEvents";
import { startEngine, getToken, setToken, authEvent, getJSON } from "./lib/store";
import type { PageId } from "./lib/nav";

function hashToPage(): PageId | null {
  const raw = window.location.hash.replace(/^#\/?/, "").trim() as PageId;
  const valid: PageId[] = ["dashboard","models","providers","policy","keys","traffic","costs","logs","backups","router","settings","health","events"];
  return (valid as string[]).includes(raw) ? (raw as PageId) : null;
}

export default function App() {
  const [page, setPage] = useState<PageId>(() => hashToPage() ?? "dashboard");
  const [locked, setLocked] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  // hash → page
  useEffect(() => {
    const onHash = () => {
      const p = hashToPage();
      if (p) setPage(p);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // page → hash (keeps URL shareable)
  const setPageWithHash = (p: PageId) => {
    setPage(p);
    const h = `#${p}`;
    if (window.location.hash !== h) window.location.hash = h;
  };

  useEffect(() => {
    const off = () => setLocked(true);
    window.addEventListener("zesrouter:unauthorized", off);
    return () => window.removeEventListener("zesrouter:unauthorized", off);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setLocked(true);
      return;
    }
    startEngine();
    getJSON<{ status: string }>("/api/health")
      .catch(() => {});
  }, []);

  async function tryUnlock() {
    const tok = tokenInput.trim();
    if (!tok) return;
    setToken(tok);
    try {
      await getJSON<{ status: string }>("/api/health");
      setLocked(false);
      startEngine();
    } catch {
      setToken("");
      setLocked(true);
    }
  }

  return (
    <Layout page={page} setPage={setPageWithHash}>
      {locked && <LoginGate token={tokenInput} setToken={setTokenInput} onUnlock={tryUnlock} />}
      {!locked && (
        <>
          {page === "dashboard" && <Dashboard setPage={setPageWithHash} />}
          {page === "models" && <Models />}
          {page === "providers" && <Providers />}
          {page === "policy" && <Policy />}
          {page === "keys" && <Keys />}
          {page === "traffic" && <Traffic />}
          {page === "costs" && <Costs />}
          {page === "logs" && <Logs />}
          {page === "backups" && <Backups />}
          {page === "router" && <RoutingEditor />}
          {page === "settings" && <SettingsPage />}
          {page === "health" && <SystemHealth />}
          {page === "events" && <LiveEvents />}
        </>
      )}
    </Layout>
  );
}

function LoginGate({ token, setToken, onUnlock }: { token: string; setToken: (t: string) => void; onUnlock: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="rounded-2xl border border-blue-400/25 bg-white/[0.04] p-6 backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-white">Dashboard locked</h2>
        <p className="mt-1 text-xs text-white/45">
          Enter the API token shown in the dashboard startup log, or at{" "}
          <code className="text-blue-300">~/.secure-credentials/zesrouter-ui.token</code>
        </p>
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onUnlock();
          }}
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="zr-…"
            autoComplete="off"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-blue-400/50 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/25 active:scale-95"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}