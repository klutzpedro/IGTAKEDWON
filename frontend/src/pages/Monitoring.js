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
  Pulse,
  Globe,
  Warning,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LINK_STATUS_MAP = {
  alive: { label: "Masih Ada", color: "bg-red-100 text-red-700 border border-red-200", icon: Globe, dot: "bg-red-500" },
  taken_down: { label: "Berhasil di-Takedown", color: "bg-green-100 text-green-700 border border-green-200", icon: CheckCircle, dot: "bg-green-500" },
  unknown: { label: "Belum Dicek", color: "bg-slate-100 text-slate-600 border border-slate-200", icon: Clock, dot: "bg-slate-400" },
  pending: { label: "Belum Dicek", color: "bg-slate-100 text-slate-600 border border-slate-200", icon: Clock, dot: "bg-slate-400" },
};

export default function Monitoring() {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [targetLogs, setTargetLogs] = useState([]);
  const [monitorChecks, setMonitorChecks] = useState([]);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [showChecksDialog, setShowChecksDialog] = useState(false);

  const fetchData = async () => {
    try {
      const { data } = await axios.get(`${API}/targets`);
      setTargets(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const checkNow = async () => {
    setChecking(true);
    try {
      const { data } = await axios.post(`${API}/monitor/check-now`);
      toast.success(`${data.results?.length || 0} target dicek`);
      fetchData();
    } catch (e) {
      toast.error("Gagal mengecek target");
    } finally {
      setChecking(false);
    }
  };

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

  const viewMonitorChecks = async (target) => {
    setSelectedTarget(target);
    try {
      const { data } = await axios.get(`${API}/monitor/checks/${target.id}?limit=30`);
      setMonitorChecks(data);
      setShowChecksDialog(true);
    } catch (e) {
      toast.error("Gagal mengambil riwayat monitoring");
    }
  };

  const getLinkStatus = (t) => {
    if (t.status === "taken_down" || t.link_status === "taken_down") return "taken_down";
    if (t.link_status === "alive") return "alive";
    return "unknown";
  };

  const filtered = statusFilter === "all"
    ? targets
    : targets.filter((t) => getLinkStatus(t) === statusFilter);

  const aliveCount = targets.filter(t => getLinkStatus(t) === "alive").length;
  const takenDownCount = targets.filter(t => getLinkStatus(t) === "taken_down").length;
  const unknownCount = targets.filter(t => getLinkStatus(t) === "unknown").length;

  return (
    <div data-testid="monitoring-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl tracking-tight font-bold text-slate-900" style={{ fontFamily: 'Chivo' }}>
            Monitoring Progress
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Pantau otomatis apakah konten masih ada atau sudah di-takedown (cek per 3 jam)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-testid="check-now-btn"
            variant="outline"
            onClick={checkNow}
            disabled={checking}
            className="gap-2"
          >
            {checking ? <SpinnerGap size={14} className="animate-spin" /> : <MagnifyingGlass size={14} />}
            Cek Sekarang
          </Button>
        </div>
      </div>

      {/* Monitor status banner */}
      <div className="rounded-md p-4 flex items-center gap-3 bg-green-50 border border-green-200">
        <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse-dot" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Auto-Monitor Aktif</p>
          <p className="text-xs text-slate-500">
            Sistem otomatis mengecek setiap 3 jam apakah konten masih ada atau sudah di-takedown. Gunakan "Cek Sekarang" untuk pengecekan langsung.
          </p>
        </div>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          data-testid="filter-alive"
          onClick={() => setStatusFilter(statusFilter === "alive" ? "all" : "alive")}
          className={`border rounded-md p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
            statusFilter === "alive" ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] font-bold text-red-600">Masih Ada</p>
              <p className="text-3xl font-black text-slate-900 mt-1" style={{ fontFamily: 'Chivo' }}>{aliveCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Konten belum di-takedown</p>
            </div>
            <Globe size={28} weight="duotone" className="text-red-400" />
          </div>
        </button>

        <button
          data-testid="filter-taken_down"
          onClick={() => setStatusFilter(statusFilter === "taken_down" ? "all" : "taken_down")}
          className={`border rounded-md p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
            statusFilter === "taken_down" ? "border-green-400 bg-green-50" : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] font-bold text-green-600">Berhasil di-Takedown</p>
              <p className="text-3xl font-black text-slate-900 mt-1" style={{ fontFamily: 'Chivo' }}>{takenDownCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Konten sudah dihapus Instagram</p>
            </div>
            <CheckCircle size={28} weight="duotone" className="text-green-500" />
          </div>
        </button>

        <button
          data-testid="filter-unknown"
          onClick={() => setStatusFilter(statusFilter === "unknown" ? "all" : "unknown")}
          className={`border rounded-md p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
            statusFilter === "unknown" ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] font-bold text-slate-600">Belum Dicek</p>
              <p className="text-3xl font-black text-slate-900 mt-1" style={{ fontFamily: 'Chivo' }}>{unknownCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Klik "Cek Sekarang" untuk update</p>
            </div>
            <Clock size={28} weight="duotone" className="text-slate-400" />
          </div>
        </button>
      </div>

      {/* Target list */}
      <div className="bg-white border border-slate-200 rounded-md">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Funnel size={16} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {statusFilter === "all" ? "Semua target" : LINK_STATUS_MAP[statusFilter]?.label}
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
              <TableHead>Status Link</TableHead>
              <TableHead>Keterangan</TableHead>
              <TableHead>Terakhir Dicek</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <SpinnerGap size={24} className="animate-spin mx-auto text-slate-400" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <ListChecks size={40} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Tidak ada target yang cocok.</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t, idx) => {
                const ls = getLinkStatus(t);
                const st = LINK_STATUS_MAP[ls] || LINK_STATUS_MAP.unknown;
                return (
                  <TableRow
                    key={t.id}
                    data-testid={`monitor-row-${t.id}`}
                    className={idx % 2 === 0 ? "" : "bg-slate-50"}
                  >
                    <TableCell>
                      <div className="max-w-[220px]">
                        <p className="text-sm font-medium text-slate-700 truncate">{t.display_name}</p>
                        <a href={t.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline truncate block">{t.url?.substring(0, 45)}...</a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-semibold ${st.color}`}>
                        <div className={`w-2 h-2 rounded-full ${st.dot} ${ls === "alive" ? "animate-pulse-dot" : ""}`} />
                        {st.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-[200px]">
                      {t.last_check_reason || "Belum pernah dicek"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-mono">
                      {t.last_checked_at
                        ? new Date(t.last_checked_at).toLocaleString("id-ID")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          data-testid={`view-checks-${t.id}`}
                          variant="outline"
                          size="sm"
                          onClick={() => viewMonitorChecks(t)}
                          className="gap-1 text-xs"
                        >
                          <Pulse size={14} />
                          Riwayat
                        </Button>
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Monitor Checks History Dialog */}
      <Dialog open={showChecksDialog} onOpenChange={setShowChecksDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Chivo' }}>
              Riwayat Monitoring: {selectedTarget?.display_name}
            </DialogTitle>
            <DialogDescription>{selectedTarget?.url}</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Waktu Cek</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead>HTTP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monitorChecks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-slate-400 text-sm">
                    Belum ada riwayat monitoring. Klik "Cek Sekarang" untuk memulai.
                  </TableCell>
                </TableRow>
              ) : (
                monitorChecks.map((check, idx) => (
                  <TableRow key={check.id || idx} className={idx % 2 === 0 ? "" : "bg-slate-50"}>
                    <TableCell className="text-xs font-mono text-slate-500">
                      {new Date(check.checked_at).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell>
                      {check.alive === true && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md font-semibold bg-red-100 text-red-700 border border-red-200">
                          <Globe size={10} />
                          Masih Ada
                        </span>
                      )}
                      {check.alive === false && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md font-semibold bg-green-100 text-green-700 border border-green-200">
                          <CheckCircle size={10} />
                          Takedown
                        </span>
                      )}
                      {check.alive !== true && check.alive !== false && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                          <Warning size={10} />
                          Tidak Pasti
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-[250px]">
                      {check.reason}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-400">
                      {check.http_status || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Report Logs Dialog */}
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
                Total: {targetLogs.length}
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
                    Belum ada log pelaporan.
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
                        <a href={`${API}/screenshots/${log.screenshot}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          <Image size={12} /> Lihat
                        </a>
                      ) : <span className="text-xs text-slate-300">—</span>}
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
