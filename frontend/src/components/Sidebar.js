import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ChartBar,
  UserCircle,
  Flag,
  ListChecks,
  Lightning,
  InstagramLogo,
  PaperPlaneRight,
  CaretDown,
  Crosshair,
} from "@phosphor-icons/react";

export default function Sidebar({ autoReportRunning }) {
  const location = useLocation();
  const [takedownOpen, setTakedownOpen] = useState(
    location.pathname === "/reports" || location.pathname === "/monitoring"
  );

  const isTakedownActive = location.pathname === "/reports" || location.pathname === "/monitoring";

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
        <NavLink
          to="/"
          end
          data-testid="nav-dashboard"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
              isActive
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
            }`
          }
        >
          <ChartBar size={20} weight="duotone" />
          Dashboard
        </NavLink>

        <NavLink
          to="/accounts"
          data-testid="nav-akun-instagram"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
              isActive
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
            }`
          }
        >
          <UserCircle size={20} weight="duotone" />
          Akun Instagram
        </NavLink>

        {/* Takedown Dropdown */}
        <div>
          <button
            data-testid="nav-takedown"
            onClick={() => setTakedownOpen(!takedownOpen)}
            className={`flex items-center justify-between w-full px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
              isTakedownActive
                ? "bg-red-50 text-red-700 border border-red-200"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
            }`}
          >
            <div className="flex items-center gap-3">
              <Crosshair size={20} weight="duotone" />
              Takedown
            </div>
            <CaretDown
              size={14}
              weight="bold"
              className={`transition-transform duration-200 ${takedownOpen ? "rotate-180" : ""}`}
            />
          </button>
          <div
            className={`overflow-hidden transition-all duration-200 ${
              takedownOpen ? "max-h-24 opacity-100 mt-0.5" : "max-h-0 opacity-0"
            }`}
          >
            <NavLink
              to="/reports"
              data-testid="nav-laporan"
              className={({ isActive }) =>
                `flex items-center gap-3 pl-10 pr-3 py-2 rounded-md text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-red-50/60 text-red-700 font-medium"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`
              }
            >
              <Flag size={16} weight="duotone" />
              Laporan
            </NavLink>
            <NavLink
              to="/monitoring"
              data-testid="nav-monitoring"
              className={({ isActive }) =>
                `flex items-center gap-3 pl-10 pr-3 py-2 rounded-md text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-red-50/60 text-red-700 font-medium"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`
              }
            >
              <ListChecks size={16} weight="duotone" />
              Monitoring
            </NavLink>
          </div>
        </div>

        <NavLink
          to="/auto-post"
          data-testid="nav-auto-post"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
              isActive
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
            }`
          }
        >
          <PaperPlaneRight size={20} weight="duotone" />
          Auto Post
        </NavLink>
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
