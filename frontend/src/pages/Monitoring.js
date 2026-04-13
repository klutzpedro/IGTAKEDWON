import { useEffect, useState } from "react";
import axios from "axios";
import {
  ArrowClockwise,
  CheckCircle,
  XCircle,
  Clock,
  Funnel,
  ListChecks,
  Eye,
  SpinnerGap,
  Image,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_MAP = {
  pending: { label: "Menunggu", color: "bg-slate-100 text-slate-600", icon: Clock },
  reporting: { label: "Sedang Melapor", color: "bg-blue-100 text-blue-700", icon: SpinnerGap },
  reported: { label: "Terlapor", color: "bg-green-100 text-green-700", icon: CheckCircle },
  failed: { label: "Gagal", color: "bg-red-100 text-red-700", icon: XCircle },
  taken_down: { label: "Dihapus", color: "bg-emerald-600 text-white", icon: CheckCircle },
};

export default function Monitoring() {
  const [targets, setTargets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [targetLogs, setTargetLogs] = useState([]);
  const [showLogsDialog, setShowLogsDialog] = useState(false);

  const fetchData = async () => {
    try {
      const [targetsRes, logsRes] = await Promise.all([
        axios.get(`${API}/targets`),
        axios.get(`${API}/reports?limit=100`),
      ]);
      setTargets(targetsRes.data);
      setLogs(logsRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 20000);
    return () => clearInterval(interval);
  }, []);

  const viewTargetLogs = async (target) => {
    setSelectedTarget(target);
    try {
      const { data } = await axios.get(`${API}/reports?target_id=${target.id}&limit=50`);
      setTargetLogs(data);
      setShowLogsDialog(true);
    } catch (e) {
      toast.error("Gagal mengambil log");
    }
  };

  const handleMarkTakedown = async (targetId) => {
    try {
      await axios.patch(`${API}/targets/${targetId}/status?status=taken_down`);
      toast.success("Target ditandai sebagai dihapus/takedown");
      fetchData();
    } catch (e) {
      toast.error("Gagal memperbarui status");
    }
  };

  const filtered = statusFilter === "all"
    ? targets
    : targets.filter((t) => t.status === statusFilter);

  return (
    <div data-testid="monitoring-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl tracking-tight font-bold text-slate-900" style={{ fontFamily: 'Chivo' }}>
            Monitoring Progress
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Pantau status pelaporan dan progress takedown
          </p>
        </div>
        <Button
          data-testid="refresh-monitoring-btn"
          variant="outline"
          onClick={fetchData}
          className="gap-2"
        >
          <ArrowClockwise size={14} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(STATUS_MAP).map(([key, st]) => {
          const count = targets.filter((t) => t.status === key).length;
          return (
            <button
              key={key}
              data-testid={`filter-${key}`}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
              className={`border rounded-md p-3 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                statusFilter === key ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"
              }`}
            >
              <p className="text-xs uppercase tracking-[0.15em] font-bold text-slate-500">{st.label}</p>
              <p className="text-2xl font-black text-slate-900 mt-1" style={{ fontFamily: 'Chivo' }}>
                {count}
              </p>
            </button>
          );
        })}
      </div>

      {/* Targets table */}
      <div className="bg-white border border-slate-200 rounded-md">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Funnel size={16} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {statusFilter === "all" ? "Semua target" : STATUS_MAP[statusFilter]?.label}
              {` (${filtered.length})`}
            </span>
          </div>
          {statusFilter !== "all" && (
            <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")} className="text-xs">
              Reset Filter
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="text-right">Laporan Terkirim</TableHead>
              <TableHead>Terakhir</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <SpinnerGap size={24} className="animate-spin mx-auto text-slate-400" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <ListChecks size={40} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Tidak ada target yang cocok.</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t, idx) => {
                const st = STATUS_MAP[t.status] || STATUS_MAP.pending;
                const progressVal = t.status === "taken_down" ? 100 : Math.min(t.total_reports_sent * 5, 95);
                return (
                  <TableRow
                    key={t.id}
                    data-testid={`monitor-row-${t.id}`}
                    className={idx % 2 === 0 ? "" : "bg-slate-50"}
                  >
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="text-sm font-medium text-slate-700 truncate">{t.display_name}</p>
                        <p className="text-xs text-slate-400 truncate">{t.url}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md font-medium ${st.color}`}>
                        <st.icon size={12} />
                        {st.label}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-[120px]">
                      <Progress value={progressVal} className="h-1.5" />
                      <span className="text-xs text-slate-400 mt-1 block">{progressVal}%</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-slate-800">
                      {t.total_reports_sent}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-mono">
                      {t.last_report_at
                        ? new Date(t.last_report_at).toLocaleString("id-ID")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          data-testid={`view-logs-${t.id}`}
                          variant="outline"
                          size="sm"
                          onClick={() => viewTargetLogs(t)}
                          className="gap-1 text-xs"
                        >
                          <Eye size={14} />
                          Log
                        </Button>
                        {t.status !== "taken_down" && (
                          <Button
                            data-testid={`mark-takedown-${t.id}`}
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkTakedown(t.id)}
                            className="gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            <CheckCircle size={14} />
                            Tandai Takedown
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Log detail dialog */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Chivo' }}>
              Log Pelaporan: {selectedTarget?.display_name}
            </DialogTitle>
            <DialogDescription>
              {selectedTarget?.url}
              <span className="block mt-1 text-xs">
                Berhasil: <strong className="text-green-600">{targetLogs.filter(l => l.status === "success").length}</strong> | 
                Gagal: <strong className="text-red-500">{targetLogs.filter(l => l.status !== "success").length}</strong> | 
                Total percobaan: {targetLogs.length}
              </span>
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Waktu</TableHead>
                <TableHead>Akun</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pesan</TableHead>
                <TableHead>Bukti</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targetLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-slate-400 text-sm">
                    Belum ada log untuk target ini.
                  </TableCell>
                </TableRow>
              ) : (
                targetLogs.map((log, idx) => (
                  <TableRow key={log.id || idx} className={idx % 2 === 0 ? "" : "bg-slate-50"}>
                    <TableCell className="text-xs font-mono text-slate-500">
                      {new Date(log.created_at).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-slate-700">
                      @{log.account_username}
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
                    <TableCell>
                      {log.screenshot ? (
                        <a
                          href={`${process.env.REACT_APP_BACKEND_URL}/api/screenshots/${log.screenshot}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`screenshot-link-${log.id}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <Image size={12} />
                          Lihat
                        </a>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
