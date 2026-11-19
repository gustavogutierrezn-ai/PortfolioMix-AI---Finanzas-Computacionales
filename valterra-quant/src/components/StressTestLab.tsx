import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookmarkPlus,
  Check,
  Database,
  FlaskConical,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { STRESS_SCENARIOS } from '../data/portfolios';
import { analyzePortfolio, runStressTest } from '../lib/quantEngine';
import type {
  MarketFeedResponse,
  PortfolioAnalyticsResult,
  SavedPortfolioDoc,
  SectorId,
  StressScenario,
  StressTestOutput,
} from '../types/quant';

export interface StressReportSavePayload {
  scenarioId: string;
  scenario: StressScenario;
  output: StressTestOutput;
  targetAnalytics: PortfolioAnalyticsResult;
  targetPortfolioName: string;
  targetSector: SectorId;
}

export interface SaveReportActionResult {
  status: 'saved' | 'duplicate' | 'error';
  message: string;
}

interface StressTestLabProps {
  analytics: PortfolioAnalyticsResult | null;
  sectorId: SectorId;
  portfolioName: string;
  portfolioValue: number;
  range?: '3mo' | '6mo' | '1y' | '2y';
  savedPortfolios?: SavedPortfolioDoc[];
  preselectedPortfolioId?: string | null;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onSaveStressReport: (payload: StressReportSavePayload) => Promise<SaveReportActionResult>;
}

export function StressTestLab({
  analytics,
  sectorId,
  portfolioName,
  portfolioValue,
  range = '1y',
  savedPortfolios = [],
  preselectedPortfolioId = null,
  isAuthenticated,
  onRequireAuth,
  onSaveStressReport,
}: StressTestLabProps) {
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>(() =>
    preselectedPortfolioId ? `saved:${preselectedPortfolioId}` : analytics ? 'active' : savedPortfolios[0] ? `saved:${savedPortfolios[0].id}` : 'active',
  );

  // Sync if caller routes directly from Saved Reports with a target portfolio ID
  useEffect(() => {
    if (preselectedPortfolioId && savedPortfolios.some((p) => p.id === preselectedPortfolioId)) {
      setSelectedSourceKey(`saved:${preselectedPortfolioId}`);
    }
  }, [preselectedPortfolioId, savedPortfolios]);

  // Auto-fallback to first saved portfolio if active has no assets yet
  useEffect(() => {
    if (selectedSourceKey === 'active' && !analytics && savedPortfolios.length > 0) {
      setSelectedSourceKey(`saved:${savedPortfolios[0].id}`);
    } else if (selectedSourceKey.startsWith('saved:')) {
      const id = selectedSourceKey.slice(6);
      if (!savedPortfolios.some((p) => p.id === id)) {
        setSelectedSourceKey('active');
      }
    }
  }, [selectedSourceKey, analytics, savedPortfolios]);

  const selectedSavedPortfolio = useMemo(() => {
    if (!selectedSourceKey.startsWith('saved:')) return null;
    const id = selectedSourceKey.slice(6);
    return savedPortfolios.find((p) => p.id === id) || null;
  }, [selectedSourceKey, savedPortfolios]);

  // Isolated market data for evaluating a saved portfolio without touching Dashboard state
  const [isolatedMarketData, setIsolatedMarketData] = useState<MarketFeedResponse | null>(null);
  const [loadingIsolated, setLoadingIsolated] = useState(false);
  const [isolatedError, setIsolatedError] = useState<string | null>(null);
  const [isolatedNonce, setIsolatedNonce] = useState(0);

  useEffect(() => {
    if (!selectedSavedPortfolio || selectedSavedPortfolio.tickers.length < 2) {
      setIsolatedMarketData(null);
      setIsolatedError(null);
      setLoadingIsolated(false);
      return;
    }

    let cancelled = false;
    async function fetchSavedPortfolioMarket() {
      setLoadingIsolated(true);
      setIsolatedError(null);
      try {
        const res = await fetch(
          `/api/market/portfolio-data?symbols=${encodeURIComponent(
            selectedSavedPortfolio!.tickers.join(','),
          )}&range=${range}`,
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'No se pudieron obtener datos históricos para la cartera.');
        }
        if (!cancelled) {
          setIsolatedMarketData(json as MarketFeedResponse);
        }
      } catch (err) {
        if (!cancelled) {
          setIsolatedError(
            err instanceof Error
              ? err.message
              : 'Error de red cargando cotizaciones de la cartera guardada.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingIsolated(false);
        }
      }
    }
    fetchSavedPortfolioMarket();
    return () => {
      cancelled = true;
    };
  }, [selectedSavedPortfolio, range, isolatedNonce]);

  const targetAnalytics = useMemo(() => {
    if (selectedSavedPortfolio) {
      if (!isolatedMarketData || isolatedMarketData.assets.length < 2) return null;
      const orderedWeights = isolatedMarketData.assets.map((asset) => {
        const idx = selectedSavedPortfolio.tickers.indexOf(asset.symbol);
        return idx >= 0
          ? (selectedSavedPortfolio.weights[idx] ?? 1 / isolatedMarketData.assets.length)
          : 1 / isolatedMarketData.assets.length;
      });
      return analyzePortfolio(
        isolatedMarketData.assets,
        selectedSavedPortfolio.riskFreeRate ?? isolatedMarketData.riskFreeRate,
        orderedWeights,
      );
    }
    return analytics;
  }, [selectedSavedPortfolio, isolatedMarketData, analytics]);

  const targetPortfolioName = selectedSavedPortfolio
    ? selectedSavedPortfolio.name
    : portfolioName;
  const targetSector: SectorId = selectedSavedPortfolio
    ? selectedSavedPortfolio.sector
    : sectorId;

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    STRESS_SCENARIOS[0].id,
  );
  const [marketShockPct, setMarketShockPct] = useState<number>(
    STRESS_SCENARIOS[0].marketShockPct,
  );
  const [volMultiplier, setVolMultiplier] = useState<number>(
    STRESS_SCENARIOS[0].volMultiplier,
  );
  const [rateShiftBps, setRateShiftBps] = useState<number>(
    STRESS_SCENARIOS[0].rateShiftBps,
  );
  const [correlationTarget, setCorrelationTarget] = useState<number>(
    STRESS_SCENARIOS[0].correlationTarget,
  );

  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveReportActionResult | null>(null);

  const activePreset =
    STRESS_SCENARIOS.find((s) => s.id === selectedScenarioId) || STRESS_SCENARIOS[0];

  const handleSelectScenario = (scenario: StressScenario) => {
    setSelectedScenarioId(scenario.id);
    setMarketShockPct(scenario.marketShockPct);
    setVolMultiplier(scenario.volMultiplier);
    setRateShiftBps(scenario.rateShiftBps);
    setCorrelationTarget(scenario.correlationTarget);
    setSaveFeedback(null);
  };

  const currentScenario: StressScenario = useMemo(
    () => ({
      ...activePreset,
      name:
        selectedScenarioId === 'custom'
          ? 'Escenario Personalizado'
          : activePreset.name,
      marketShockPct,
      volMultiplier,
      rateShiftBps,
      correlationTarget,
    }),
    [
      activePreset,
      selectedScenarioId,
      marketShockPct,
      volMultiplier,
      rateShiftBps,
      correlationTarget,
    ],
  );

  const output = useMemo(() => {
    if (!targetAnalytics) return null;
    return runStressTest(targetAnalytics, targetSector, currentScenario);
  }, [targetAnalytics, targetSector, currentScenario]);

  const handleSave = async () => {
    if (!targetAnalytics || !output) return;
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setSaving(true);
    setSaveFeedback(null);
    try {
      const result = await onSaveStressReport({
        scenarioId: selectedScenarioId,
        scenario: currentScenario,
        output,
        targetAnalytics,
        targetPortfolioName,
        targetSector,
      });
      setSaveFeedback(result);
    } catch (err) {
      setSaveFeedback({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'No se pudo guardar el reporte de estrés en Firebase.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
      {/* Header + Portfolio Selector + Save Action */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Módulo de Pruebas de Estrés Financiero
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 text-[11px] font-medium text-amber-800 dark:text-amber-300">
              <FlaskConical className="w-3 h-3" />
              <span>Simulación hipotética académica</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
              <Database className="w-3 h-3" />
              <span>Base: datos históricos observados</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Evalúa la sensibilidad de{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {targetPortfolioName || 'tu portafolio'}
            </strong>{' '}
            (Capital ref. ${Math.round(portfolioValue).toLocaleString('en-US')}) ante choques adversos
            de retorno, volatilidad, correlaciones de Pearson y tasa libre de riesgo.
          </p>
        </div>

        <button
          type="button"
          disabled={saving || !targetAnalytics || !output}
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#635BFF] hover:bg-[#5243E5] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          {saveFeedback?.status === 'saved' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-300" />
              <span>Reporte Guardado</span>
            </>
          ) : (
            <>
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>{saving ? 'Guardando...' : 'Guardar Reporte de Estrés'}</span>
            </>
          )}
        </button>
      </div>

      {/* Save Feedback Banner (Success, Duplicate Prevention, or Error) */}
      {saveFeedback && (
        <div
          role="status"
          className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-xs ${
            saveFeedback.status === 'saved'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : saveFeedback.status === 'duplicate'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {saveFeedback.status === 'saved' ? (
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{saveFeedback.message}</span>
        </div>
      )}

      {/* Portfolio Selector Bar (Regla 3: Active or Saved Account Portfolios, strictly isolated) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <Layers className="w-4 h-4 text-[#635BFF]" />
          <span>Cartera a evaluar (aislada por cuenta):</span>
        </div>
        <div className="flex items-center gap-2 min-w-0 sm:min-w-[300px]">
          <select
            value={selectedSourceKey}
            onChange={(e) => {
              setSelectedSourceKey(e.target.value);
              setSaveFeedback(null);
            }}
            aria-label="Seleccionar portafolio para prueba de estrés"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="active">
              Portafolio Activo: {portfolioName}
              {analytics ? ` (${analytics.assets.map((a) => a.symbol).join(', ')})` : ' (sin activos)'}
            </option>
            {savedPortfolios.map((p) => (
              <option key={p.id} value={`saved:${p.id}`}>
                Guardado: {p.name} ({p.tickers.join(', ')})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Data Distinction Notice */}
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 px-4 py-2.5 text-[11.5px] text-slate-600 dark:text-slate-300 leading-relaxed">
        <strong className="text-slate-800 dark:text-slate-100">Nota metodológica:</strong> Las
        volatilidades base, retornos esperados y correlaciones de Pearson provienen de{' '}
        <strong>series históricas observadas</strong>. Los escenarios listados abajo son{' '}
        <strong>simulaciones paramétricas académicas</strong> de sensibilidad (no reconstrucciones
        históricas exactas) basadas en la matriz de covarianza re-escalada{' '}
        <span className="font-mono">Σ_estrés</span>.
      </div>

      {/* 6 Required Scenarios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {STRESS_SCENARIOS.map((sc) => {
          const active = selectedScenarioId === sc.id;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => handleSelectScenario(sc)}
              className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                active
                  ? 'border-[#635BFF] bg-indigo-50/60 dark:bg-indigo-950/40 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                {sc.name}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                Choque {sc.marketShockPct}% · Vol {sc.volMultiplier.toFixed(2)}× · ρ{' '}
                {sc.correlationTarget.toFixed(2)} · {sc.rateShiftBps >= 0 ? `+${sc.rateShiftBps}` : sc.rateShiftBps} bps
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                {sc.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Loading / Error / Empty States for Selected Portfolio */}
      {loadingIsolated && (
        <div className="py-10 text-center space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl">
          <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin mx-auto" />
          <div className="text-xs text-slate-600 dark:text-slate-300">
            Cargando series de mercado reales para {selectedSavedPortfolio?.name}...
          </div>
        </div>
      )}

      {isolatedError && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-3 flex items-center justify-between text-xs text-rose-800 dark:text-rose-200">
          <span>{isolatedError}</span>
          <button
            type="button"
            onClick={() => setIsolatedNonce((n) => n + 1)}
            className="font-semibold underline cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {!loadingIsolated && !isolatedError && (!targetAnalytics || !output) && (
        <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-500 dark:text-slate-400">
          Selecciona una cartera con al menos 2 activos reales en el Dashboard o elige una cartera
          guardada en el selector superior para ejecutar la simulación de estrés.
        </div>
      )}

      {/* Parameter Sliders + Stressed KPIs + Asset Impact Table */}
      {!loadingIsolated && targetAnalytics && output && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-1">
          {/* Configurable Parameter Sliders */}
          <div className="lg:col-span-5 space-y-4 p-4 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Parámetros de Simulación
              </span>
              {selectedScenarioId === 'custom' && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                  Personalizado
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  Choque porcentual del mercado
                </span>
                <span className="font-mono tabular-nums font-semibold text-rose-700 dark:text-rose-400">
                  {marketShockPct}%
                </span>
              </div>
              <input
                type="range"
                min={-55}
                max={15}
                step={1}
                value={marketShockPct}
                onChange={(e) => {
                  setSelectedScenarioId('custom');
                  setMarketShockPct(Number(e.target.value));
                  setSaveFeedback(null);
                }}
                className="w-full accent-[#635BFF] cursor-pointer h-1.5"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  Multiplicador de volatilidad (σ)
                </span>
                <span className="font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                  {volMultiplier.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min={0.8}
                max={3.5}
                step={0.05}
                value={volMultiplier}
                onChange={(e) => {
                  setSelectedScenarioId('custom');
                  setVolMultiplier(Number(e.target.value));
                  setSaveFeedback(null);
                }}
                className="w-full accent-[#635BFF] cursor-pointer h-1.5"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  Convergencia de correlaciones (ρ)
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {correlationTarget.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.05}
                value={correlationTarget}
                onChange={(e) => {
                  setSelectedScenarioId('custom');
                  setCorrelationTarget(Number(e.target.value));
                  setSaveFeedback(null);
                }}
                className="w-full accent-[#635BFF] cursor-pointer h-1.5"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  Desplazamiento tasa libre de riesgo
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {rateShiftBps >= 0 ? `+${rateShiftBps}` : rateShiftBps} bps
                </span>
              </div>
              <input
                type="range"
                min={-250}
                max={450}
                step={25}
                value={rateShiftBps}
                onChange={(e) => {
                  setSelectedScenarioId('custom');
                  setRateShiftBps(Number(e.target.value));
                  setSaveFeedback(null);
                }}
                className="w-full accent-[#635BFF] cursor-pointer h-1.5"
              />
            </div>
          </div>

          {/* Stressed Results + Asset Impact Table */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Rendimiento Estresado
                </div>
                <div
                  className={`mt-1 text-lg font-mono tabular-nums font-bold ${
                    output.stressedReturn >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {(output.stressedReturn * 100).toFixed(2)}%
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Base: {(output.baselineReturn * 100).toFixed(2)}%
                </div>
              </div>

              <div className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Volatilidad Estresada
                </div>
                <div className="mt-1 text-lg font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                  {(output.stressedVolatility * 100).toFixed(2)}%
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Var: {(output.stressedWeightedVariance * 100).toFixed(2)}%²
                </div>
              </div>

              <div className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Ratio de Sharpe Estrés
                </div>
                <div
                  className={`mt-1 text-lg font-mono tabular-nums font-bold ${
                    output.stressedSharpe >= 0
                      ? 'text-slate-900 dark:text-white'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {output.stressedSharpe.toFixed(2)}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Base: {output.baselineSharpe.toFixed(2)}
                </div>
              </div>

              <div className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  VaR 95% / CVaR 95%
                </div>
                <div className="mt-1 text-lg font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                  −{(output.var95 * 100).toFixed(1)}%
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  CVaR 95%: −{(output.cvar95 * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                    <th className="py-2 px-3">Activo</th>
                    <th className="py-2 px-3 text-right">Peso</th>
                    <th className="py-2 px-3 text-right">Vol. Base</th>
                    <th className="py-2 px-3 text-right">Vol. Estrés</th>
                    <th className="py-2 px-3 text-right">Impacto Estimado</th>
                    <th className="py-2 px-3 text-right">Contrib. Riesgo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                  {output.assetImpacts.map((row) => (
                    <tr key={row.symbol}>
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                        {row.symbol}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300">
                        {(row.weight * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-400">
                        {(row.baselineVol * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right text-amber-600 dark:text-amber-400">
                        {(row.stressedVol * 100).toFixed(1)}%
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-medium ${
                          row.projectedLossPct >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {row.projectedLossPct >= 0 ? '+' : ''}
                        {row.projectedLossPct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right text-slate-900 dark:text-white font-semibold">
                        {row.riskContributionPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 text-xs text-slate-700 dark:text-slate-300">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div>
                  Drawdown estimado bajo estrés:{' '}
                  <strong className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
                    {output.estimatedDrawdownPct.toFixed(1)}%
                  </strong>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Metodología: {output.drawdownMethodology}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
