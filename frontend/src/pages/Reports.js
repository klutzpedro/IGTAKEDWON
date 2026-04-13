import { useEffect, useState } from "react";
import axios from "axios";
import {
  Plus,
  Trash,
  Play,
  ToggleLeft,
  ToggleRight,
  Link as LinkIcon,
  SpinnerGap,
  Flag,
  PencilSimple,
  Timer,
  Hand,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "../components/ui/table";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_MAP = {
  pending: { label: "Menunggu", color: "bg-slate-100 text-slate-600" },
  reporting: { label: "Sedang Melapor", color: "bg-blue-100 text-blue-700" },
  reported: { label: "Terlapor", color: "bg-green-100 text-green-700" },
  failed: { label: "Gagal", color: "bg-red-100 text-red-700" },
  taken_down: { label: "Dihapus", color: "bg-emerald-600 text-white" },
};

export default function Reports() {
  const [targets, setTargets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("spam");
  const [autoReport, setAutoReport] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reporting, setReporting] = useState({});
  const [editTarget, setEditTarget] = useState(null);
  const [editUrl, setEditUrl] = useState("");
  const [editCategory, setEditCategory] = useState("spam");
  const [editAutoReport, setEditAutoReport] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fetchTargets = async () => {
    try {
      const { data } = await axios.get(`${API}/targets`);
      setTargets(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data } = await axios.get(`${API}/report-categories`);
      setCategories(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTargets();
    fetchCategories();
  }, []);

  const handleAdd = async () => {
    if (!url.trim()) {
      toast.error("URL harus diisi");
      return;
    }
    if (!url.includes("instagram.com")) {
      toast.error("URL harus dari instagram.com");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/targets`, {
        url: url.trim(),
        category,
        auto_report: autoReport,
      });
      toast.success("Target berhasil ditambahkan");
      setShowDialog(false);
      setUrl("");
      setCategory("spam");
      setAutoReport(false);
      fetchTargets();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menambahkan target");
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualReport = async (targetId) => {
    setReporting((prev) => ({ ...prev, [targetId]: true }));
    try {
      const { data } = await axios.post(`${API}/targets/${targetId}/report`);
      const successCount = data.results?.filter((r) => r.status === "success").length || 0;
      toast.success(`Laporan terkirim: ${successCount} berhasil dari ${data.results?.length || 0} akun`);
      fetchTargets();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal mengirim laporan");
    } finally {
      setReporting((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  const handleStartTargetAuto = async (targetId, mode) => {
    try {
      const { data } = await axios.post(`${API}/targets/${targetId}/report-auto`, { mode });
      toast.success(data.message || `Auto-report dimulai (${mode})`);
      fetchTargets();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memulai auto-report");
    }
  };

  const handleToggleAuto = async (targetId) => {
    try {
      const { data } = await axios.patch(`${API}/targets/${targetId}/toggle-auto`);
      toast.success(data.auto_report ? "Auto-report diaktifkan" : "Auto-report dimatikan");
      fetchTargets();
    } catch (e) {
      toast.error("Gagal mengubah auto-report");
    }
  };

  const openEditDialog = (target) => {
    setEditTarget(target);
    setEditUrl(target.url);
    setEditCategory(target.category);
    setEditAutoReport(target.auto_report);
    setShowEditDialog(true);
  };

  const handleEdit = async () => {
    if (!editUrl.trim()) {
      toast.error("URL tidak boleh kosong");
      return;
    }
    if (!editUrl.includes("instagram.com")) {
      toast.error("URL harus dari instagram.com");
      return;
    }
    const payload = {};
    if (editUrl.trim() !== editTarget.url) payload.url = editUrl.trim();
    if (editCategory !== editTarget.category) payload.category = editCategory;
    if (editAutoReport !== editTarget.auto_report) payload.auto_report = editAutoReport;
    if (Object.keys(payload).length === 0) {
      toast.info("Tidak ada perubahan");
      setShowEditDialog(false);
      return;
    }
    setEditSubmitting(true);
    try {
      await axios.patch(`${API}/targets/${editTarget.id}`, payload);
      toast.success("Target berhasil diupdate");
      setShowEditDialog(false);
      setEditTarget(null);
      fetchTargets();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal mengupdate target");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (targetId) => {
    if (!window.confirm("Hapus target ini?")) return;
    try {
      await axios.delete(`${API}/targets/${targetId}`);
      toast.success("Target dihapus");
      fetchTargets();
    } catch (e) {
      toast.error("Gagal menghapus target");
    }
  };

  return (
    <div data-testid="reports-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl tracking-tight font-bold text-slate-900" style={{ fontFamily: 'Chivo' }}>
            Target Pelaporan
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Tambahkan link Instagram yang ingin dilaporkan
          </p>
        </div>
        <Button
          data-testid="add-target-btn"
          onClick={() => setShowDialog(true)}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
        >
          <Plus size={16} weight="bold" />
          Tambah Target
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Target</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Laporan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Auto</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <SpinnerGap size={24} className="animate-spin mx-auto text-slate-400" />
                </TableCell>
              </TableRow>
            ) : targets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <Flag size={40} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Belum ada target. Klik "Tambah Target" untuk memulai.</p>
                </TableCell>
              </TableRow>
            ) : (
              targets.map((t, idx) => {
                const st = STATUS_MAP[t.status] || STATUS_MAP.pending;
                return (
                  <TableRow
                    key={t.id}
                    data-testid={`target-row-${t.id}`}
                    className={idx % 2 === 0 ? "" : "bg-slate-50"}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 max-w-[250px]">
                        <LinkIcon size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-700 truncate" title={t.url}>
                          {t.display_name || t.url}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 capitalize">
                        {t.target_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-600">
                        {categories.find((c) => c.id === t.category)?.label || t.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-slate-800">
                      {t.total_reports_sent}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-md font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        data-testid={`toggle-auto-${t.id}`}
                        onClick={() => handleToggleAuto(t.id)}
                        className="text-slate-500 hover:text-blue-600 transition-colors"
                      >
                        {t.auto_report ? (
                          <ToggleRight size={24} weight="fill" className="text-blue-600" />
                        ) : (
                          <ToggleLeft size={24} weight="regular" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              data-testid={`report-btn-${t.id}`}
                              variant="outline"
                              size="sm"
                              disabled={reporting[t.id]}
                              className="gap-1 text-xs"
                            >
                              {reporting[t.id] ? (
                                <SpinnerGap size={14} className="animate-spin" />
                              ) : (
                                <Play size={14} weight="fill" />
                              )}
                              Report
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuItem
                              data-testid={`report-variasi-${t.id}`}
                              onClick={() => handleStartTargetAuto(t.id, "variasi")}
                              className="flex items-start gap-2.5 p-2.5 cursor-pointer"
                            >
                              <Timer size={16} weight="duotone" className="text-blue-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-slate-800">Variasi</p>
                                <p className="text-xs text-slate-500">Jeda setiap 15-20 report, lanjut 1 jam</p>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-testid={`report-manual-${t.id}`}
                              onClick={() => handleStartTargetAuto(t.id, "manual")}
                              className="flex items-start gap-2.5 p-2.5 cursor-pointer"
                            >
                              <Hand size={16} weight="duotone" className="text-amber-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-slate-800">Manual</p>
                                <p className="text-xs text-slate-500">Terus berjalan, stop secara manual</p>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          data-testid={`edit-target-${t.id}`}
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(t)}
                          className="gap-1 text-xs"
                        >
                          <PencilSimple size={14} />
                          Edit
                        </Button>
                        <Button
                          data-testid={`delete-target-${t.id}`}
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(t.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash size={14} />
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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Chivo' }}>Tambah Target Pelaporan</DialogTitle>
            <DialogDescription>
              Masukkan link postingan, reel, story, atau profil Instagram.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                URL Instagram
              </label>
              <Input
                data-testid="input-target-url"
                placeholder="https://www.instagram.com/p/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                Kategori Pelaporan
              </label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 px-1">
              <button
                data-testid="toggle-auto-new"
                onClick={() => setAutoReport(!autoReport)}
                className="text-slate-500 hover:text-blue-600 transition-colors"
              >
                {autoReport ? (
                  <ToggleRight size={28} weight="fill" className="text-blue-600" />
                ) : (
                  <ToggleLeft size={28} weight="regular" />
                )}
              </button>
              <span className="text-sm text-slate-600">
                Aktifkan auto-report (laporan berulang otomatis)
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="cancel-add-target-btn"
              variant="outline"
              onClick={() => setShowDialog(false)}
            >
              Batal
            </Button>
            <Button
              data-testid="submit-add-target-btn"
              onClick={handleAdd}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {submitting && <SpinnerGap size={14} className="animate-spin" />}
              Tambah Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Target Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Chivo' }}>
              <div className="flex items-center gap-2">
                <PencilSimple size={24} className="text-blue-600" />
                Edit Target
              </div>
            </DialogTitle>
            <DialogDescription>
              Edit URL, kategori, atau pengaturan auto-report untuk target ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                URL Instagram
              </label>
              <Input
                data-testid="edit-target-url"
                placeholder="https://www.instagram.com/p/..."
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                Kategori Pelaporan
              </label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger data-testid="edit-select-category">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 px-1">
              <button
                data-testid="edit-toggle-auto"
                onClick={() => setEditAutoReport(!editAutoReport)}
                className="text-slate-500 hover:text-blue-600 transition-colors"
              >
                {editAutoReport ? (
                  <ToggleRight size={28} weight="fill" className="text-blue-600" />
                ) : (
                  <ToggleLeft size={28} weight="regular" />
                )}
              </button>
              <span className="text-sm text-slate-600">
                Aktifkan auto-report (laporan berulang otomatis)
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="cancel-edit-target-btn"
              variant="outline"
              onClick={() => setShowEditDialog(false)}
            >
              Batal
            </Button>
            <Button
              data-testid="submit-edit-target-btn"
              onClick={handleEdit}
              disabled={editSubmitting}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {editSubmitting && <SpinnerGap size={14} className="animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
