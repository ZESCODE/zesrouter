import { lazy, Suspense, useEffect, useState } from "react";
import Layout from "./components/Layout";
import { startEngine, getToken, setToken, getJSON } from "./lib/store";
import { ALL_PAGE_IDS, parseHash, toHash, type PageId } from "./lib/nav";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Models = lazy(() => import("./pages/Models"));
const Providers = lazy(() => import("./pages/Providers"));
const Policy = lazy(() => import("./pages/Policy"));
const Keys = lazy(() => import("./pages/Keys"));
const Traffic = lazy(() => import("./pages/Traffic"));
const Logs = lazy(() => import("./pages/Logs"));
const Backups = lazy(() => import("./pages/Backups"));
const RoutingEditor = lazy(() => import("./pages/RoutingEditor"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const SystemHealth = lazy(() => import("./pages/SystemHealth"));
const LiveEvents = lazy(() => import("./pages/LiveEvents"));
const Combos = lazy(() => import("./pages/Combos"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Playground = lazy(() => import("./pages/Playground"));
const Translator = lazy(() => import("./pages/Translator"));
const Agents = lazy(() => import("./pages/Agents"));
const CliTools = lazy(() => import("./pages/CliTools"));
const ContextRelay = lazy(() => import("./pages/ContextRelay"));
const FreeTiers = lazy(() => import("./pages/FreeTiers"));

function Fallback() {
  return <div className="py-16 text-center text-xs text-blue-200/50">Loading frost panel…</div>;
}

export default function App() {
  const [route, setRoute] = useState(() => parseHash());
  const [locked, setLocked] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setPage = (p: PageId, parts: string[] = []) => {
    const h = toHash(p, parts);
    if (window.location.hash !== h) window.location.hash = h;
    setRoute({ page: p, parts });
  };

  useEffect(() => {
    const off = () => setLocked(true);
    window.addEventListener("zesrouter:unauthorized", off);
    return () => window.removeEventListener("zesrouter:unauthorized", off);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await getJSON<{ status: string }>("/api/health");
        setLocked(false);
        startEngine();
      } catch {
        if (!getToken()) setLocked(true);
      }
    })();
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

  const page = ALL_PAGE_IDS.includes(route.page) ? route.page : "dashboard";

  return (
    <Layout page={page} setPage={setPage}>
      {locked && <LoginGate token={tokenInput} setToken={setTokenInput} onUnlock={tryUnlock} />}
      {!locked && (
        <Suspense fallback={<Fallback />}>
          {page === "dashboard" && <Dashboard setPage={setPage} />}
          {page === "models" && <Models />}
          {page === "providers" && <Providers parts={route.parts} setPage={setPage} />}
          {page === "policy" && <Policy />}
          {page === "keys" && <Keys />}
          {page === "traffic" && <Traffic />}
          {page === "logs" && <Logs />}
          {page === "backups" && <Backups />}
          {page === "router" && <RoutingEditor />}
          {page === "settings" && <SettingsPage parts={route.parts} setPage={setPage} />}
          {page === "health" && <SystemHealth />}
          {page === "events" && <LiveEvents />}
          {page === "combos" && <Combos parts={route.parts} setPage={setPage} />}
          {page === "analytics" && <Analytics parts={route.parts} setPage={setPage} />}
          {page === "playground" && <Playground />}
          {page === "translator" && <Translator parts={route.parts} setPage={setPage} />}
          {page === "agents" && <Agents parts={route.parts} setPage={setPage} />}
          {page === "cli-tools" && <CliTools />}
          {page === "context" && <ContextRelay />}
          {page === "free-tiers" && <FreeTiers />}
        </Suspense>
      )}
    </Layout>
  );
}

function LoginGate({ token, setToken, onUnlock }: { token: string; setToken: (t: string) => void; onUnlock: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="frost-card frost-blue-bg p-6">
        <h2 className="text-lg font-semibold text-white">Dashboard locked</h2>
        <p className="mt-1 text-xs text-white/55">
          Enter the API token shown in the dashboard startup log, or at{" "}
          <code className="text-blue-200">~/.secure-credentials/zesrouter-ui.token</code>
        </p>
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onUnlock();
          }}
        >
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="zr-…" autoComplete="off" className="frost-input" />
          <button type="submit" className="frost-btn frost-btn-frost">
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}

