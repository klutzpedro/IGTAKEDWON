import { NavLink } from "react-router-dom";
import {
  ChartBar,
  UserCircle,
  Flag,
  ListChecks,
  Lightning,
  InstagramLogo,
} from "@phosphor-icons/react";

const navItems = [
  { to: "/", icon: ChartBar, label: "Dashboard", end: true },
  { to: "/accounts", icon: UserCircle, label: "Akun Instagram" },
  { to: "/reports", icon: Flag, label: "Laporan" },
  { to: "/monitoring", icon: ListChecks, label: "Monitoring" },
];

export default function Sidebar({ autoReportRunning }) {
  return (
    <aside
      data-testid="sidebar"
      className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 flex flex-col z-40"
    >
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-blue-600 flex items-center justify-center">
            <InstagramLogo size={22} weight="bold" className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none" style={{ fontFamily: 'Chivo' }}>
              IG Reporter
            </h1>
            <span className="text-xs text-slate-500">Automation Tool</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
              }`
            }
          >
            <item.icon size={20} weight="duotone" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className={`w-2 h-2 rounded-full ${autoReportRunning ? 'bg-green-500 animate-pulse-dot' : 'bg-slate-300'}`} />
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {autoReportRunning ? "Auto-report aktif" : "Auto-report mati"}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1">
          <Lightning size={14} weight="fill" className="text-amber-500" />
          <span className="text-xs text-slate-400">v1.0 Beta</span>
        </div>
      </div>
    </aside>
  );
}
