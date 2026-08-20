import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Models from "./pages/Models";
import Providers from "./pages/Providers";
import Policy from "./pages/Policy";
import Keys from "./pages/Keys";
import Traffic from "./pages/Traffic";
import SettingsPage from "./pages/Settings";
import SystemHealth from "./pages/SystemHealth";
import LiveEvents from "./pages/LiveEvents";
import { startEngine } from "./lib/store";
import type { PageId } from "./lib/nav";

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");

  useEffect(() => {
    startEngine();
  }, []);

  return (
    <Layout page={page} setPage={setPage}>
      {page === "dashboard" && <Dashboard setPage={setPage} />}
      {page === "models" && <Models />}
      {page === "providers" && <Providers />}
      {page === "policy" && <Policy />}
      {page === "keys" && <Keys />}
      {page === "traffic" && <Traffic />}
      {page === "settings" && <SettingsPage />}
      {page === "health" && <SystemHealth />}
      {page === "events" && <LiveEvents />}
    </Layout>
  );
}
