export function StatsCard({ icon: Icon, label, value, subValue, color = "blue" }) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    slate: "bg-slate-50 text-slate-600",
  };

  return (
    <div
      data-testid={`stats-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="bg-white border border-slate-200 rounded-md p-5 hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 mb-2">
            {label}
          </p>
          <p className="text-3xl font-black text-slate-900 tracking-tight" style={{ fontFamily: 'Chivo' }}>
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-slate-500 mt-1">{subValue}</p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-md flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={22} weight="duotone" />
        </div>
      </div>
    </div>
  );
}
