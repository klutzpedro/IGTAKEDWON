import { useEffect, useState } from "react";
import axios from "axios";
import {
  UserCircle,
  Flag,
  CheckCircle,
  Warning,
  ArrowClockwise,
  Lightning,
  Timer,
  Hand,
  Pause,
} from "@phosphor-icons/react";
import { StatsCard } from "../components/StatsCard";
import { Badge } from "../components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Dashboard({ autoReportRunning, setAutoReportRunning }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoMode, setAutoMode] = useState("manual");
  const [cycleCount, setCycleCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [resumeAt, setResumeAt] = useState("");

  const fetchStats = async () => {
    try {
      const [statsRes, arRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`),
        axios.get(`${API}/auto-report/status`),
      ]);
      setStats(statsRes.data);
      setAutoReportRunning(statsRes.data.auto_report_running);
      setAutoMode(arRes.data.mode || "manual");
      setCycleCount(arRes.data.cycle_count || 0);
      setPaused(arRes.data.paused || false);
      setResumeAt(arRes.data.resume_at || "");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const startAutoReport = async (mode) => {
    try {
      await axios.post(`${API}/auto-report/start`, { mode });
      setAutoReportRunning(true);
      setAutoMode(mode);
      toast.success(
        mode === "variasi"
          ? "Auto-report (Variasi) dimulai - jeda otomatis setiap 15-20 report berhasil"
          : "Auto-report (Manual) dimulai - berjalan terus sampai distop manual"
      );
    } catch (e) {
      toast.error("Gagal memulai auto-report");
    }
  };

  const stopAutoReport = async () => {
    try {
      await axios.post(`${API}/auto-report/stop`);
      setAutoReportRunning(false);
      setCycleCount(0);
      setPaused(false);
      toast.success("Auto-report dihentikan");
    } catch (e) {
      toast.error("Gagal menghentikan auto-report");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-50 border border-slate-200 rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl tracking-tight font-bold text-slate-900" style={{ fontFamily: 'Chivo' }}>
            Dashboard
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Ringkasan aktivitas pelaporan Instagram
          </p>
        </div>
        <div className="flex items-center gap-2">
          {autoReportRunning ? (
            <Button
              data-testid="stop-auto-report-btn"
              onClick={stopAutoReport}
              variant="destructive"
              className="gap-2"
            >
              <Lightning size={16} weight="fill" />
              Stop Auto-Report
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="start-auto-report-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                  <Lightning size={16} weight="fill" />
                  Start Auto-Report
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem
                  data-testid="start-variasi-btn"
                  onClick={() => startAutoReport("variasi")}
                  className="flex items-start gap-3 p-3 cursor-pointer"
                >
                  <Timer size={20} weight="duotone" className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Variasi</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Jeda otomatis setiap 15-20 report berhasil, lanjut setelah 1 jam
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="start-manual-btn"
                  onClick={() => startAutoReport("manual")}
                  className="flex items-start gap-3 p-3 cursor-pointer"
                >
                  <Hand size={20} weight="duotone" className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Manual</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Berjalan terus tanpa jeda, stop hanya secara manual
                    </p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Auto-report status banner */}
      {autoReportRunning && (
        <div className={`rounded-md p-4 flex items-center justify-between ${
          paused ? "bg-amber-50 border border-amber-200" : "bg-blue-50 border border-blue-200"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${paused ? "bg-amber-500" : "bg-blue-500 animate-pulse-dot"}`} />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {paused ? "Auto-Report Dijeda" : "Auto-Report Aktif"}
                <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                  {autoMode === "variasi" ? "Mode Variasi" : "Mode Manual"}
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {paused
                  ? `Dijeda setelah ${cycleCount} report berhasil. Lanjut otomatis ${resumeAt ? "pukul " + new Date(resumeAt).toLocaleTimeString("id-ID") : "dalam 1 jam"}`
                  : autoMode === "variasi"
                    ? `${cycleCount}/15-20 report berhasil dalam siklus ini. Jeda otomatis saat tercapai.`
                    : "Berjalan terus sampai dihentikan manual."
                }
              </p>
            </div>
          </div>
          {paused && (
            <Badge variant="outline" className="border-amber-300 text-amber-700 gap-1">
              <Pause size={12} weight="fill" />
              Jeda 1 Jam
            </Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={UserCircle}
          label="Akun Aktif"
          value={stats?.logged_in_accounts || 0}
          subValue={`${stats?.total_accounts || 0} total akun`}
          color="blue"
        />
        <StatsCard
          icon={Flag}
          label="Total Laporan"
          value={stats?.total_reports || 0}
          subValue={`${stats?.active_targets || 0} target aktif`}
          color="amber"
        />
        <StatsCard
          icon={CheckCircle}
          label="Berhasil"
          value={stats?.successful_reports || 0}
          subValue={`${stats?.taken_down || 0} takedown`}
          color="green"
        />
        <StatsCard
          icon={Warning}
          label="Gagal"
          value={stats?.failed_reports || 0}
          subValue="Perlu dicek ulang"
          color="red"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-md">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800" style={{ fontFamily: 'Chivo' }}>
            Aktivitas Terbaru
          </h3>
          <Button
            data-testid="refresh-dashboard-btn"
            variant="outline"
            size="sm"
            onClick={fetchStats}
            className="gap-2"
          >
            <ArrowClockwise size={14} />
            Refresh
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Waktu</TableHead>
              <TableHead>Akun</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pesan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!stats?.recent_logs || stats.recent_logs.length === 0) ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                  Belum ada aktivitas. Mulai tambahkan akun dan target.
                </TableCell>
              </TableRow>
            ) : (
              stats.recent_logs.map((log, idx) => (
                <TableRow
                  key={log.id || idx}
                  className={idx % 2 === 0 ? "" : "bg-slate-50"}
                >
                  <TableCell className="text-xs font-mono text-slate-500">
                    {new Date(log.created_at).toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-slate-700">
                    @{log.account_username}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                      {log.category}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={log.status === "success" ? "default" : "destructive"}
                      className={log.status === "success" ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      {log.status === "success" ? "Berhasil" : "Gagal"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">
                    {log.message}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
