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

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loggingIn, setLoggingIn] = useState({});

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
  }, []);

  const handleAdd = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("Username dan password harus diisi");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/accounts`, { username: username.trim(), password });
      toast.success(`Akun @${username.trim()} ditambahkan`);
      setShowDialog(false);
      setUsername("");
      setPassword("");
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal menambahkan akun");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (accountId, accountUsername) => {
    setLoggingIn((prev) => ({ ...prev, [accountId]: true }));
    try {
      await axios.post(`${API}/accounts/${accountId}/login`);
      toast.success(`@${accountUsername} berhasil login`);
      fetchAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || `Login @${accountUsername} gagal`);
    } finally {
      setLoggingIn((prev) => ({ ...prev, [accountId]: false }));
    }
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
        <Button
          data-testid="add-account-btn"
          onClick={() => setShowDialog(true)}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
        >
          <Plus size={16} weight="bold" />
          Tambah Akun
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Username</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Ditambahkan</TableHead>
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
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <UserCircle size={40} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Belum ada akun. Klik "Tambah Akun" untuk memulai.</p>
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((acc, idx) => (
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
                    <Badge
                      variant={acc.is_logged_in ? "default" : "secondary"}
                      className={acc.is_logged_in ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      {acc.is_logged_in ? "Aktif" : "Tidak Aktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-red-500 max-w-[200px] truncate">
                    {acc.login_error || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 font-mono">
                    {new Date(acc.created_at).toLocaleDateString("id-ID")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
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
                          onClick={() => handleLogin(acc.id, acc.username)}
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
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
          </div>
          <DialogFooter>
            <Button
              data-testid="cancel-add-account-btn"
              variant="outline"
              onClick={() => setShowDialog(false)}
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
    </div>
  );
}
