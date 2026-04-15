import { useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import Accounts from "@/pages/Accounts";
import Reports from "@/pages/Reports";
import Monitoring from "@/pages/Monitoring";
import AutoPost from "@/pages/AutoPost";

function App() {
  const [autoReportRunning, setAutoReportRunning] = useState(false);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-white">
        <Sidebar autoReportRunning={autoReportRunning} />
        <main className="flex-1 ml-64">
          <div className="p-8 max-w-[1400px]">
            <Routes>
              <Route
                path="/"
                element={
                  <Dashboard
                    autoReportRunning={autoReportRunning}
                    setAutoReportRunning={setAutoReportRunning}
                  />
                }
              />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/monitoring" element={<Monitoring />} />
              <Route path="/auto-post" element={<AutoPost />} />
            </Routes>
          </div>
        </main>
      </div>
      <Toaster position="bottom-right" richColors />
    </BrowserRouter>
  );
}

export default App;
