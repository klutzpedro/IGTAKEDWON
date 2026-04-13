import { useEffect, useState } from "react";
import axios from "axios";
import {
  UserCircle,
  Flag,
  CheckCircle,
  Warning,
  ArrowClockwise,
  Lightning,
} from "@phosphor-icons/react";
import { StatsCard } from "../components/StatsCard";
import { Badge } from "../components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Dashboard({ autoReportRunning, setAutoReportRunning }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const { data } = await axios.get(`${API}/dashboard/stats`);
      setStats(data);
      setAutoReportRunning(data.auto_report_running);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const toggleAutoReport = async () => {
    try {
      if (autoReportRunning) {
        await axios.post(`${API}/auto-report/stop`);
        toast.success("Auto-report dihentikan");
      } else {
        await axios.post(`${API}/auto-report/start`);
        toast.success("Auto-report dimulai");
      }
      setAutoReportRunning(!autoReportRunning);
    } catch (e) {
      toast.error("Gagal mengubah status auto-report");
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
        <Button
          data-testid="toggle-auto-report-btn"
          onClick={toggleAutoReport}
          variant={autoReportRunning ? "destructive" : "default"}
          className="gap-2"
        >
          <Lightning size={16} weight="fill" />
          {autoReportRunning ? "Stop Auto-Report" : "Start Auto-Report"}
        </Button>
      </div>

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
                  style={{ animationDelay: `${idx * 50}ms` }}
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
