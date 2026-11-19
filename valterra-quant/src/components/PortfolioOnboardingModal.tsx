import { useEffect, useState } from 'react';
import { Coins, Plus, Search, Sparkles, X } from 'lucide-react';
import { SECTOR_PRESETS } from '../data/portfolios';
import type { SectorId, TickerSearchResult } from '../types/quant';

const POPULAR_TICKERS = [
  'AAPL',
  'MSFT',
  'NVDA',
  'JPM',
  'KO',
  'GOOGL',
  'AMZN',
  'TSLA',
  'SPY',
  'AMGN',
  'NEM',
];

const QUICK_CAPITALS = [10000, 25000, 50000, 100000];

interface PortfolioOnboardingModalProps {
  open: boolean;
  userName: string;
  initialCapital: number;
  initialTickers: string[];
  onClose: () => void;
  onComplete: (payload: {
    capital: number;
    tickers: string[];
    portfolioName: string;
    sector: SectorId;
  }) => Promise<void> | void;
}

export function PortfolioOnboardingModal({
  open,
  userName,
  initialCapital,
  initialTickers,
  onClose,
  onComplete,
}: PortfolioOnboardingModalProps) {
  const [capitalInput, setCapitalInput] = useState(
    initialCapital > 0 ? String(initialCapital) : '',
  );
  const [selectedTickers, setSelectedTickers] = useState<string[]>(initialTickers);
  const [portfolioName, setPortfolioName] = useState('Mi Portafolio');
  const [sector, setSector] = useState<SectorId>('multisector');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCapitalInput(initialCapital > 0 ? String(initialCapital) : '');
      setSelectedTickers(initialTickers);
      setErrorMsg(null);
    }
  }, [open, initialCapital, initialTickers]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (!cancelled) {
          setResults(json.quotes || []);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  if (!open) return null;

  const toggleTicker = (sym: string) => {
    const clean = sym.trim().toUpperCase();
    if (!clean) return;
    setErrorMsg(null);
    if (selectedTickers.includes(clean)) {
      setSelectedTickers((prev) => prev.filter((t) => t !== clean));
    } else if (selectedTickers.length < 12) {
      setSelectedTickers((prev) => [...prev, clean]);
    }
  };

  const applyPreset = (presetId: SectorId) => {
    const preset = SECTOR_PRESETS.find((s) => s.id === presetId);
    if (!preset) return;
    setSector(preset.id);
    setPortfolioName(preset.name);
    setSelectedTickers(preset.tickers.slice(0, 5));
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedCapital = Number(capitalInput);
    if (!Number.isFinite(parsedCapital) || parsedCapital < 100) {
      setErrorMsg('Ingresa un valor de portafolio válido (mínimo $100 USD).');
      return;
    }
    if (selectedTickers.length < 2) {
      setErrorMsg('Selecciona al menos 2 activos para optimizar tu portafolio.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onComplete({
        capital: Math.min(1000000000, Math.round(parsedCapital)),
        tickers: selectedTickers,
        portfolioName: portfolioName.trim().slice(0, 100) || 'Mi Portafolio',
        sector,
      });
    } catch {
      setErrorMsg('No se pudo guardar tu configuración inicial. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/70 dark:border-indigo-800 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2
                id="onboarding-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white leading-tight"
              >
                Configura tu Portafolio Inicial
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bienvenido, {userName}. Registra tu capital y elige tus activos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana de configuración"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Capital Input */}
          <div className="space-y-2">
            <label
              htmlFor="onboarding-capital"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              <Coins className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Valor del portafolio (USD)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-400">
                $
              </span>
              <input
                id="onboarding-capital"
                type="number"
                min={100}
                max={1000000000}
                step="any"
                value={capitalInput}
                onChange={(e) => {
                  setCapitalInput(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="Ej. 100000"
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_CAPITALS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setCapitalInput(String(amt));
                    setErrorMsg(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                    Number(capitalInput) === amt
                      ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-400 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  ${amt.toLocaleString('en-US')}
                </button>
              ))}
            </div>
          </div>

          {/* Search Yahoo Finance Assets */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Activos que deseas seleccionar
              </span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {selectedTickers.length} seleccionados (mín. 2)
              </span>
            </div>

            <div className="relative">
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 focus-within:border-indigo-500">
                <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar acción o ETF (ej. AAPL, NVDA, KO, SPY)..."
                  className="w-full bg-transparent text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {(results.length > 0 || searching) && (
                <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-20 max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {searching && (
                    <div className="p-2.5 text-xs text-slate-500">Buscando en Yahoo Finance...</div>
                  )}
                  {results.map((item) => {
                    const already = selectedTickers.includes(item.symbol);
                    return (
                      <button
                        key={item.symbol}
                        type="button"
                        onClick={() => {
                          if (!already) toggleTicker(item.symbol);
                          setQuery('');
                          setResults([]);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs cursor-pointer"
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {item.symbol}
                          </span>
                          <span className="ml-2 text-slate-500 dark:text-slate-400">
                            {item.shortname}
                          </span>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Popular Ticker Quick-Pick */}
            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Selección rápida por ticker o cartera sectorial:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_TICKERS.map((sym) => {
                  const active = selectedTickers.includes(sym);
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => toggleTicker(sym)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                      }`}
                    >
                      {active ? `${sym} ✓` : `+ ${sym}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sector Shortcuts */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SECTOR_PRESETS.slice(0, 4).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-[11px] text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  {preset.name}
                </button>
              ))}
            </div>

            {/* Selected Tray */}
            {selectedTickers.length > 0 && (
              <div className="pt-2 flex flex-wrap gap-1.5">
                {selectedTickers.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-semibold"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => toggleTicker(t)}
                      aria-label={`Quitar ${t}`}
                      className="hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            Omitir por ahora
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
          >
            {submitting ? 'Guardando...' : 'Guardar y Analizar'}
          </button>
        </div>
      </form>
    </div>
  );
}
