import { useEffect, useState } from "react";
import axios from "axios";
import {
  Plus,
  SignIn,
  SignOut,
  Trash,
  Eye,
  EyeSlash,
  UserCircle,
  SpinnerGap,
  ShieldCheck,
  ArrowClockwise,
  Globe,
  WarningCircle,
  PencilSimple,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "../components/ui/table";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGIN_STATUS_MAP = {
  idle: { label: "Belum Login", color: "bg-slate-100 text-slate-600" },
  logging_in: { label: "Sedang Login...", color: "bg-blue-100 text-blue-700" },
  challenge_required: { label: "Verifikasi", color: "bg-amber-100 text-amber-700" },
  logged_in: { label: "Aktif", color: "bg-green-100 text-green-700" },
  failed: { label: "Gagal", color: "bg-red-100 text-red-700" },
};

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showChallengeDialog, setShowChallengeDialog] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [proxy, setProxy] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loggingIn, setLoggingIn] = useState({});
  const [challengeAccount, setChallengeAccount] = useState(null);
  const [challengeCode, setChallengeCode] = useState("");
  const [challengeInfo, setChallengeInfo] = useState(null);
  const [submittingChallenge, setSubmittingChallenge] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editProxy, setEditProxy] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [proxyStatus, setProxyStatus] = useState({});

  const fetchAccounts = async () => {
    try {
      const { data } = await axios.get(`${API}/accounts`);
      setAccounts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    const interval = setInterval(fetchAccounts, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAdd = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("Username dan password harus diisi");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/accounts`, {
        username: username.trim(),
        password,
        proxy: proxy.trim(),
      });
      toast.success(`Akun @${username.trim()} ditambahkan`);
      setShowAddDialog(false);
      setUsername("");
      setPassword("");
      setProxy("");
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menambahkan akun");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (account) => {
    setLoggingIn((prev) => ({ ...prev, [account.id]: true }));
    try {
      const { data } = await axios.post(`${API}/accounts/${account.id}/login`);

      if (data.status === "challenge_required") {
        setChallengeAccount(account);
        setChallengeInfo(data);
        setChallengeCode("");
        setShowChallengeDialog(true);
        toast.info(data.message || "Verifikasi diperlukan");
      } else {
        toast.success(data.message || `@${account.username} berhasil login`);
      }
      fetchAccounts();
    } catch (e) {
      const detail = e.response?.data?.detail || "";
      toast.error(detail || `Login @${account.username} gagal`);
      fetchAccounts();
    } finally {
      setLoggingIn((prev) => ({ ...prev, [account.id]: false }));
    }
  };

  const handleSubmitChallenge = async () => {
    if (!challengeCode.trim()) {
      toast.error("Masukkan kode verifikasi");
      return;
    }
    setSubmittingChallenge(true);
    try {
      const { data } = await axios.post(
        `${API}/accounts/${challengeAccount.id}/challenge`,
        { code: challengeCode.trim() }
      );
      toast.success(data.message || "Verifikasi berhasil!");
      setShowChallengeDialog(false);
      setChallengeAccount(null);
      setChallengeCode("");
      setChallengeInfo(null);
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Kode verifikasi salah");
    } finally {
      setSubmittingChallenge(false);
    }
  };

  const handleResendCode = async () => {
    try {
      const { data } = await axios.post(
        `${API}/accounts/${challengeAccount.id}/challenge/resend`
      );
      toast.success(data.message || "Kode dikirim ulang");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal kirim ulang kode");
    }
  };

  const openChallengeDialog = (account) => {
    setChallengeAccount(account);
    setChallengeCode("");
    setChallengeInfo({ method: account.challenge_method || "email" });
    setShowChallengeDialog(true);
  };

  const handleLogout = async (accountId, accountUsername) => {
    try {
      await axios.post(`${API}/accounts/${accountId}/logout`);
      toast.success(`@${accountUsername} berhasil logout`);
      fetchAccounts();
    } catch (e) {
      toast.error("Gagal logout");
    }
  };

  const openEditDialog = (account) => {
    setEditAccount(account);
    setEditUsername(account.username);
    setEditPassword("");
    setEditProxy(account.proxy || "");
    setShowEditPassword(false);
    setShowEditDialog(true);
  };

  const handleEdit = async () => {
    if (!editUsername.trim()) {
      toast.error("Username tidak boleh kosong");
      return;
    }
    const payload = {};
    if (editUsername.trim() !== editAccount.username) {
      payload.username = editUsername.trim();
    }
    if (editPassword.trim()) {
      payload.password = editPassword.trim();
    }
    if (editProxy.trim() !== (editAccount.proxy || "")) {
      payload.proxy = editProxy.trim();
    }
    if (Object.keys(payload).length === 0) {
      toast.info("Tidak ada perubahan");
      setShowEditDialog(false);
      return;
    }
    setEditSubmitting(true);
    try {
      await axios.patch(`${API}/accounts/${editAccount.id}`, payload);
      toast.success(`Akun @${editAccount.username} berhasil diupdate`);
      setShowEditDialog(false);
      setEditAccount(null);
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal mengupdate akun");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (accountId, accountUsername) => {
    if (!window.confirm(`Hapus akun @${accountUsername}?`)) return;
    try {
      await axios.delete(`${API}/accounts/${accountId}`);
      toast.success(`Akun @${accountUsername} dihapus`);
      fetchAccounts();
    } catch (e) {
      toast.error("Gagal menghapus akun");
    }
  };

  const checkProxy = async (accountId) => {
    setProxyStatus((prev) => ({ ...prev, [accountId]: { status: "checking", message: "Mengecek..." } }));
    try {
      const { data } = await axios.post(`${API}/proxy/check/${accountId}`);
      setProxyStatus((prev) => ({ ...prev, [accountId]: data }));
    } catch {
      setProxyStatus((prev) => ({ ...prev, [accountId]: { status: "error", message: "Gagal cek" } }));
    }
  };

  const checkAllProxies = async () => {
    for (const acc of accounts) {
      if (acc.proxy) checkProxy(acc.id);
    }
  };

  return (
    <div data-testid="accounts-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl tracking-tight font-bold text-slate-900" style={{ fontFamily: 'Chivo' }}>
            Akun Instagram
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Kelola akun Instagram yang digunakan untuk pelaporan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-testid="check-all-proxy-btn"
            variant="outline"
            onClick={checkAllProxies}
            className="gap-2 text-sm"
          >
            <Globe size={16} weight="duotone" />
            Cek Semua Proxy
          </Button>
          <Button
            data-testid="add-account-btn"
            onClick={() => setShowAddDialog(true)}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Plus size={16} weight="bold" />
            Tambah Akun
          </Button>
        </div>
      </div>

      {/* Info box about proxy */}
      <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex gap-3">
        <WarningCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold mb-1">Tips Login Instagram</p>
          <ul className="list-disc pl-4 space-y-1 text-xs text-amber-700">
            <li>Gunakan <strong>proxy residential</strong> untuk menghindari blokir IP (format: http://user:pass@ip:port)</li>
            <li>Instagram akan mengirim kode verifikasi via email/SMS saat login dari lokasi baru</li>
            <li>Pastikan Anda punya akses ke email/nomor HP yang terdaftar di akun Instagram</li>
            <li>Jika muncul CAPTCHA, tunggu beberapa jam sebelum coba lagi</li>
          </ul>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Username</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Proxy</TableHead>
              <TableHead>Status Proxy</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Info</TableHead>
              <TableHead>Ditambahkan</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  <SpinnerGap size={24} className="animate-spin mx-auto text-slate-400" />
                </TableCell>
              </TableRow>
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  <UserCircle size={40} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Belum ada akun. Klik "Tambah Akun" untuk memulai.</p>
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((acc, idx) => {
                const st = LOGIN_STATUS_MAP[acc.login_status] || LOGIN_STATUS_MAP.idle;
                return (
                  <TableRow
                    key={acc.id}
                    data-testid={`account-row-${acc.username}`}
                    className={idx % 2 === 0 ? "" : "bg-slate-50"}
                  >
                    <TableCell className="font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <UserCircle size={20} weight="duotone" className="text-slate-400" />
                        @{acc.username}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center text-xs px-2 py-1 rounded-md font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {acc.proxy ? (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Globe size={12} />
                          <span className="max-w-[100px] truncate">{acc.proxy}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {acc.proxy ? (
                        <div className="flex items-center gap-1.5">
                          {proxyStatus[acc.id] ? (
                            proxyStatus[acc.id].status === "checking" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                <SpinnerGap size={12} className="animate-spin" /> Cek...
                              </span>
                            ) : proxyStatus[acc.id].status === "online" ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-green-50 text-green-700 border border-green-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Online
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-200" title={proxyStatus[acc.id].message}>
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                {proxyStatus[acc.id].status === "timeout" ? "Timeout" : proxyStatus[acc.id].status === "offline" ? "Offline" : "Error"}
                              </span>
                            )
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => checkProxy(acc.id)} className="h-6 text-xs text-slate-500 hover:text-blue-600 px-2" data-testid={`check-proxy-${acc.username}`}>
                              Cek Proxy
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {proxyStatus[acc.id] && proxyStatus[acc.id].ip ? (
                        <span className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {proxyStatus[acc.id].ip}
                        </span>
                      ) : acc.proxy ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-[200px]">
                      {acc.login_error ? (
                        <span className="text-red-500 truncate block" title={acc.login_error}>
                          {acc.login_error}
                        </span>
                      ) : acc.is_logged_in ? (
                        <span className="text-green-600">Siap digunakan</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-mono">
                      {new Date(acc.created_at).toLocaleDateString("id-ID")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {acc.login_status === "challenge_required" && (
                          <Button
                            data-testid={`challenge-btn-${acc.username}`}
                            variant="outline"
                            size="sm"
                            onClick={() => openChallengeDialog(acc)}
                            className="gap-1 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-300"
                          >
                            <ShieldCheck size={14} />
                            Masukkan Kode
                          </Button>
                        )}
                        {acc.is_logged_in ? (
                          <Button
                            data-testid={`logout-btn-${acc.username}`}
                            variant="outline"
                            size="sm"
                            onClick={() => handleLogout(acc.id, acc.username)}
                            className="gap-1 text-xs"
                          >
                            <SignOut size={14} />
                            Logout
                          </Button>
                        ) : (
                          <Button
                            data-testid={`login-btn-${acc.username}`}
                            variant="outline"
                            size="sm"
                            onClick={() => handleLogin(acc)}
                            disabled={loggingIn[acc.id]}
                            className="gap-1 text-xs"
                          >
                            {loggingIn[acc.id] ? (
                              <SpinnerGap size={14} className="animate-spin" />
                            ) : (
                              <SignIn size={14} />
                            )}
                            Login
                          </Button>
                        )}
                        <Button
                          data-testid={`edit-btn-${acc.username}`}
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(acc)}
                          className="gap-1 text-xs"
                        >
                          <PencilSimple size={14} />
                          Edit
                        </Button>
                        <Button
                          data-testid={`delete-btn-${acc.username}`}
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(acc.id, acc.username)}
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

      {/* Add Account Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Chivo' }}>Tambah Akun Instagram</DialogTitle>
            <DialogDescription>
              Masukkan kredensial akun Instagram untuk digunakan pelaporan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                Username
              </label>
              <Input
                data-testid="input-username"
                placeholder="username_instagram"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <Input
                  data-testid="input-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password akun"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                Proxy (Opsional)
              </label>
              <div className="relative">
                <Input
                  data-testid="input-proxy"
                  placeholder="http://user:pass@ip:port"
                  value={proxy}
                  onChange={(e) => setProxy(e.target.value)}
                />
                <Globe size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Gunakan proxy residential untuk menghindari blokir IP Instagram
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="cancel-add-account-btn"
              variant="outline"
              onClick={() => setShowAddDialog(false)}
            >
              Batal
            </Button>
            <Button
              data-testid="submit-add-account-btn"
              onClick={handleAdd}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {submitting && <SpinnerGap size={14} className="animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Challenge / Verification Code Dialog */}
      <Dialog open={showChallengeDialog} onOpenChange={setShowChallengeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Chivo' }}>
              <div className="flex items-center gap-2">
                <ShieldCheck size={24} className="text-amber-600" />
                Verifikasi Diperlukan
              </div>
            </DialogTitle>
            <DialogDescription>
              Instagram memerlukan verifikasi untuk akun <strong>@{challengeAccount?.username}</strong>.
              {challengeInfo?.method === "2fa"
                ? " Masukkan kode dari authenticator app Anda."
                : " Kode verifikasi telah dikirim ke email/SMS yang terdaftar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm text-blue-800">
                {challengeInfo?.method === "email" && "Cek inbox email yang terdaftar di akun Instagram Anda"}
                {challengeInfo?.method === "sms" && "Cek SMS di nomor HP yang terdaftar di akun Instagram Anda"}
                {challengeInfo?.method === "2fa" && "Buka Google Authenticator / authenticator app Anda"}
                {!["email", "sms", "2fa"].includes(challengeInfo?.method) && "Cek email atau SMS Anda untuk kode verifikasi"}
              </p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                Kode Verifikasi
              </label>
              <Input
                data-testid="input-challenge-code"
                placeholder="Masukkan 6 digit kode"
                value={challengeCode}
                onChange={(e) => setChallengeCode(e.target.value)}
                maxLength={8}
                className="text-center text-lg tracking-[0.3em] font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitChallenge();
                }}
              />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              data-testid="resend-code-btn"
              variant="ghost"
              size="sm"
              onClick={handleResendCode}
              className="text-xs text-slate-500 gap-1"
            >
              <ArrowClockwise size={12} />
              Kirim Ulang Kode
            </Button>
            <div className="flex gap-2">
              <Button
                data-testid="cancel-challenge-btn"
                variant="outline"
                onClick={() => setShowChallengeDialog(false)}
              >
                Batal
              </Button>
              <Button
                data-testid="submit-challenge-btn"
                onClick={handleSubmitChallenge}
                disabled={submittingChallenge}
                className="bg-blue-600 hover:bg-blue-700 gap-2"
              >
                {submittingChallenge && <SpinnerGap size={14} className="animate-spin" />}
                Verifikasi
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Chivo' }}>
              <div className="flex items-center gap-2">
                <PencilSimple size={24} className="text-blue-600" />
                Edit Akun
              </div>
            </DialogTitle>
            <DialogDescription>
              Edit kredensial akun <strong>@{editAccount?.username}</strong>. Jika username/password diubah, Anda perlu login ulang.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                Username
              </label>
              <Input
                data-testid="edit-input-username"
                placeholder="username_instagram"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                Password Baru (kosongkan jika tidak diubah)
              </label>
              <div className="relative">
                <Input
                  data-testid="edit-input-password"
                  type={showEditPassword ? "text" : "password"}
                  placeholder="Kosongkan jika tidak diubah"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showEditPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5 block">
                Proxy (Opsional)
              </label>
              <div className="relative">
                <Input
                  data-testid="edit-input-proxy"
                  placeholder="http://user:pass@ip:port"
                  value={editProxy}
                  onChange={(e) => setEditProxy(e.target.value)}
                />
                <Globe size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            {(editUsername !== editAccount?.username || editPassword.trim()) && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-xs text-amber-700">
                  <WarningCircle size={14} className="inline mr-1" weight="fill" />
                  Mengubah username/password akan mereset status login. Anda perlu login ulang setelah menyimpan.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              data-testid="cancel-edit-account-btn"
              variant="outline"
              onClick={() => setShowEditDialog(false)}
            >
              Batal
            </Button>
            <Button
              data-testid="submit-edit-account-btn"
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
