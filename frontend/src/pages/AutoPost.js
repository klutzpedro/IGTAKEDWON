import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  PaperPlaneRight,
  Clock,
  Sparkle,
  Trash,
  Eye,
  Play,
  Pause,
  CalendarBlank,
  Image as ImageIcon,
  TextAa,
  ArrowClockwise,
  CheckCircle,
  XCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "../components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function ScheduleForm({ accounts, languages, onCreated }) {
  const [accountId, setAccountId] = useState("");
  const [theme, setTheme] = useState("");
  const [language, setLanguage] = useState("id");
  const [scheduleTime, setScheduleTime] = useState("13:00");
  const [imageSource, setImageSource] = useState("mixed");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accountId || !theme.trim()) {
      toast.error("Pilih akun dan masukkan tema");
      return;
    }
    setCreating(true);
    try {
      await axios.post(`${API}/auto-post/schedules`, {
        account_id: accountId,
        theme: theme.trim(),
        language,
        schedule_time: scheduleTime,
        frequency: "daily",
        image_source: imageSource,
      });
      toast.success("Jadwal auto-post berhasil dibuat!");
      setTheme("");
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal membuat jadwal");
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="autopost-form" className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkle size={20} weight="fill" className="text-amber-500" />
        <h2 className="text-base font-semibold text-slate-900">Buat Jadwal Auto Post</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Akun Instagram</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger data-testid="autopost-account-select" className="h-9 text-sm">
              <SelectValue placeholder="Pilih akun..." />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  @{a.username} {a.is_logged_in ? "" : "(belum login)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Bahasa</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger data-testid="autopost-language-select" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs font-medium text-slate-600">Tema / Topik Konten</Label>
          <Input
            data-testid="autopost-theme-input"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Contoh: motivasi pagi hari, tips bisnis online, fakta unik..."
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Jam Posting (WIB)</Label>
          <Input
            data-testid="autopost-time-input"
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Sumber Gambar</Label>
          <Select value={imageSource} onValueChange={setImageSource}>
            <SelectTrigger data-testid="autopost-image-source" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mixed">Campuran (AI + Web)</SelectItem>
              <SelectItem value="web">Web (Unsplash/Pexels)</SelectItem>
              <SelectItem value="ai">AI Generated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end">
          <Button
            data-testid="autopost-submit-btn"
            type="submit"
            disabled={creating || !accountId || !theme.trim()}
            className="h-9 bg-blue-600 hover:bg-blue-700 text-white text-sm gap-2"
          >
            {creating ? (
              <CircleNotch size={16} className="animate-spin" />
            ) : (
              <CalendarBlank size={16} weight="bold" />
            )}
            {creating ? "Membuat..." : "Buat Jadwal"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function PreviewModal({ open, onClose, theme, language }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (open && theme) {
      setLoading(true);
      setPreview(null);
      axios
        .post(`${API}/auto-post/preview?theme=${encodeURIComponent(theme)}&language=${language}`)
        .then((res) => setPreview(res.data))
        .catch(() => toast.error("Gagal generate preview"))
        .finally(() => setLoading(false));
    }
  }, [open, theme, language]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        data-testid="autopost-preview-modal"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Preview Caption</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle size={22} />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
            <CircleNotch size={20} className="animate-spin" />
            <span className="text-sm">Generating caption dengan AI...</span>
          </div>
        ) : preview ? (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-md p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
              {preview.caption}
            </div>
            {preview.hashtags && (
              <div className="bg-blue-50 rounded-md p-3 text-sm text-blue-700 font-medium">
                {preview.hashtags}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500 py-8 text-center">Tidak ada data preview</p>
        )}
      </div>
    </div>
  );
}

function HistorySection({ history, loading }) {
  if (loading) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg" data-testid="autopost-history">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <Clock size={18} weight="duotone" className="text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">Riwayat Posting</h2>
      </div>
      {history.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-slate-400">
          Belum ada riwayat posting
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/60">
              <TableHead className="text-xs font-semibold text-slate-500">Waktu</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500">Akun</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500">Tema</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500">Caption</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500">Gambar</TableHead>
              <TableHead className="text-xs font-semibold text-slate-500">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((h) => (
              <TableRow key={h.id} className="hover:bg-slate-50/50">
                <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                  {h.created_at ? new Date(h.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                </TableCell>
                <TableCell className="text-xs font-medium text-slate-700">
                  @{h.account_username || "-"}
                </TableCell>
                <TableCell className="text-xs text-slate-600 max-w-[120px] truncate">
                  {h.theme || "-"}
                </TableCell>
                <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">
                  {h.caption ? h.caption.substring(0, 80) + "..." : "-"}
                </TableCell>
                <TableCell>
                  {h.image ? (
                    <a
                      href={`${API}/screenshots/${h.image}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <ImageIcon size={14} /> Lihat
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={h.status === "success" ? "default" : "destructive"}
                    className={`text-xs ${h.status === "success" ? "bg-green-50 text-green-700 border-green-200" : ""}`}
                  >
                    {h.status === "success" ? "Berhasil" : "Gagal"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function AutoPost() {
  const [accounts, setAccounts] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postingIds, setPostingIds] = useState(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTheme, setPreviewTheme] = useState("");
  const [previewLang, setPreviewLang] = useState("id");

  const fetchAll = useCallback(async () => {
    try {
      const [accRes, langRes, schedRes, histRes] = await Promise.all([
        axios.get(`${API}/accounts`),
        axios.get(`${API}/auto-post/languages`),
        axios.get(`${API}/auto-post/schedules`),
        axios.get(`${API}/auto-post/history?limit=20`),
      ]);
      setAccounts(accRes.data);
      setLanguages(langRes.data);
      setSchedules(schedRes.data);
      setHistory(histRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const toggleSchedule = async (id, active) => {
    try {
      await axios.patch(`${API}/auto-post/schedules/${id}`, { active: !active });
      toast.success(active ? "Jadwal dinonaktifkan" : "Jadwal diaktifkan");
      fetchAll();
    } catch {
      toast.error("Gagal mengubah status jadwal");
    }
  };

  const deleteSchedule = async (id) => {
    try {
      await axios.delete(`${API}/auto-post/schedules/${id}`);
      toast.success("Jadwal dihapus");
      fetchAll();
    } catch {
      toast.error("Gagal menghapus jadwal");
    }
  };

  const postNow = async (id) => {
    setPostingIds((prev) => new Set(prev).add(id));
    toast.info("Memulai generate & posting... ini bisa memakan waktu 1-2 menit");
    try {
      const res = await axios.post(`${API}/auto-post/schedules/${id}/post-now`);
      toast.success(res.data.message || "Posting berhasil!");
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal posting");
    } finally {
      setPostingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const openPreview = (theme, lang) => {
    setPreviewTheme(theme);
    setPreviewLang(lang);
    setPreviewOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-2 text-slate-500" data-testid="autopost-loading">
        <CircleNotch size={24} className="animate-spin" />
        <span>Memuat...</span>
      </div>
    );
  }

  const loggedInAccounts = accounts.filter((a) => a.is_logged_in);

  return (
    <div className="space-y-6" data-testid="autopost-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Auto Post</h1>
          <p className="text-sm text-slate-500 mt-1">
            Jadwalkan posting otomatis dengan gambar & caption AI
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAll}
          className="gap-1.5 text-xs"
          data-testid="autopost-refresh-btn"
        >
          <ArrowClockwise size={14} />
          Refresh
        </Button>
      </div>

      {loggedInAccounts.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-sm text-amber-800" data-testid="autopost-no-account-warning">
          <strong>Tidak ada akun yang login.</strong> Silakan login ke akun Instagram di halaman{" "}
          <a href="/accounts" className="underline font-medium">Akun Instagram</a> terlebih dahulu.
        </div>
      ) : (
        <ScheduleForm accounts={loggedInAccounts} languages={languages} onCreated={fetchAll} />
      )}

      {/* Active Schedules */}
      <div className="bg-white border border-slate-200 rounded-lg" data-testid="autopost-schedules-table">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <CalendarBlank size={18} weight="duotone" className="text-blue-600" />
          <h2 className="text-base font-semibold text-slate-900">Jadwal Aktif</h2>
          <Badge variant="secondary" className="text-xs ml-auto">{schedules.length} jadwal</Badge>
        </div>
        {schedules.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            Belum ada jadwal posting. Buat jadwal baru di atas.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/60">
                <TableHead className="text-xs font-semibold text-slate-500">Akun</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Tema</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Bahasa</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Jam</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Gambar</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Status</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500">Terakhir</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((s) => {
                const isPosting = postingIds.has(s.id);
                return (
                  <TableRow key={s.id} className="hover:bg-slate-50/50">
                    <TableCell className="text-sm font-medium text-slate-700">
                      @{s.account_username}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 max-w-[180px] truncate">
                      {s.theme}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {s.language === "id" ? "ID" : s.language === "en" ? "EN" : "Mix"}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-slate-700">
                      {s.schedule_time}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {s.image_source === "ai" ? "AI" : s.image_source === "web" ? "Web" : "Campuran"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.active ? "default" : "secondary"}
                        className={`text-xs cursor-pointer ${s.active ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" : "hover:bg-slate-100"}`}
                        onClick={() => toggleSchedule(s.id, s.active)}
                        data-testid={`schedule-toggle-${s.id}`}
                      >
                        {s.active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {s.last_posted_at
                        ? new Date(s.last_posted_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                        : "Belum pernah"}
                      {s.last_status && (
                        <span className="ml-1">
                          {s.last_status === "success" ? (
                            <CheckCircle size={13} className="inline text-green-500" />
                          ) : (
                            <XCircle size={13} className="inline text-red-500" />
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPreview(s.theme, s.language)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                          title="Preview caption"
                          data-testid={`schedule-preview-${s.id}`}
                        >
                          <Eye size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPosting}
                          onClick={() => postNow(s.id)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-green-600"
                          title="Post sekarang"
                          data-testid={`schedule-postnow-${s.id}`}
                        >
                          {isPosting ? (
                            <CircleNotch size={15} className="animate-spin" />
                          ) : (
                            <PaperPlaneRight size={15} />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteSchedule(s.id)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                          title="Hapus jadwal"
                          data-testid={`schedule-delete-${s.id}`}
                        >
                          <Trash size={15} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* History */}
      <HistorySection history={history} loading={loading} />

      {/* Preview Modal */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        theme={previewTheme}
        language={previewLang}
      />
    </div>
  );
}
