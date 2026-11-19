import {
  CalendarRange,
  FolderArchive,
  Home,
  Network,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  User as UserIcon,
  X,
} from 'lucide-react';

export type SidebarTab =
  | 'dashboard'
  | 'predictions'
  | 'build'
  | 'market'
  | 'stress'
  | 'history'
  | 'account';

interface SidebarNavProps {
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: SidebarTab; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'predictions', label: 'Predicciones', icon: CalendarRange },
  { id: 'build', label: 'Construir Portafolio', icon: Network },
  { id: 'market', label: 'Análisis de Mercado', icon: TrendingUp },
  { id: 'stress', label: 'Pruebas de Estrés', icon: ShieldAlert },
  { id: 'history', label: 'Reportes Guardados', icon: FolderArchive },
  { id: 'account', label: 'Mi Cuenta', icon: UserIcon },
];

export function SidebarNav({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
}: SidebarNavProps) {
  const sidebarBody = (
    <div className="relative h-full w-[225px] flex flex-col justify-between bg-gradient-to-b from-[#0D132B] via-[#11193B] to-[#171E4B] text-white px-4 py-6 overflow-hidden select-none">
      {/* Subtle bottom-left indigo ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-indigo-600/25 blur-3xl"
      />

      <div className="relative z-10 space-y-8">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => {
              onSelectTab('dashboard');
              onCloseMobile();
            }}
            className="flex flex-col items-start gap-2 cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#4F46E5] flex items-end justify-center gap-0.5 p-1.5 shadow-md shadow-indigo-950/60">
                <span className="w-1 h-2 bg-indigo-200 rounded-xs" />
                <span className="w-1 h-3.5 bg-white rounded-xs" />
                <span className="w-1 h-4.5 bg-sky-300 rounded-xs" />
              </div>
              <span className="text-[17px] font-bold tracking-tight text-white whitespace-nowrap">
                PortfolioMix AI
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1.5" aria-label="Menú principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#6D5DF6] to-[#5243E5] text-white shadow-lg shadow-indigo-950/60'
                    : 'text-slate-300 hover:text-white hover:bg-white/8'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Powered by Gemini Card */}
      <div className="relative z-10 mt-6">
        <div className="rounded-2xl bg-white/6 border border-white/10 px-4 py-3.5 flex items-center gap-3 backdrop-blur-sm">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/25 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-300" />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] text-slate-400">Powered by</div>
            <div className="text-sm font-semibold text-white">Gemini</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">
        {sidebarBody}
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
}
