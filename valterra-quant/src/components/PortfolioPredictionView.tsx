import { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  Coins,
  Download,
  Info,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { computePortfolioPredictions } from '../lib/quantEngine';
import type {
  HorizonSummaryCard,
  PortfolioAnalyticsResult,
  PredictionConfidenceLevel,
  PredictionHorizonId,
  PredictionReturnModel,
  PredictionStepPoint,
} from '../types/quant';

interface PortfolioPredictionViewProps {
  analytics: PortfolioAnalyticsResult | null;
  loadingMarket: boolean;
  portfolioName: string;
  portfolioValue: number;
  onOpenOnboarding: () => void;
  onNavigateBuild: () => void;
}

function formatUsd(val: number, decimals = 0): string {
  if (!Number.isFinite(val)) return '$0';
  return val.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatSignedUsd(val: number, decimals = 0): string {
  if (!Number.isFinite(val)) return '$0';
  const sign = val >= 0 ? '+' : '-';
  return `${sign}${formatUsd(Math.abs(val), decimals)}`;
}

function formatCompactUsd(val: number): string {
  if (!Number.isFinite(val)) return '$0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

export function PortfolioPredictionView({
  analytics,
  loadingMarket,
  portfolioName,
  portfolioValue,
  onOpenOnboarding,
  onNavigateBuild,
}: PortfolioPredictionViewProps) {
  const [selectedHorizon, setSelectedHorizon] = useState<PredictionHorizonId>('monthly');
  const [returnModel, setReturnModel] = useState<PredictionReturnModel>('historical');
  const [confidenceLevel, setConfidenceLevel] = useState<PredictionConfidenceLevel>(90);
  const [simulatedCapital, setSimulatedCapital] = useState<number>(portfolioValue);
  const [periodicContribution, setPeriodicContribution] = useState<number>(0);
  const [hoveredStepIdx, setHoveredStepIdx] = useState<number | null>(null);
  const [showMethodInfo, setShowMethodInfo] = useState(false);

  // Sync simulated capital when account portfolioValue changes
  useEffect(() => {
    setSimulatedCapital(portfolioValue);
  }, [portfolioValue]);

  // Reset hover index when horizon changes
  useEffect(() => {
    setHoveredStepIdx(null);
  }, [selectedHorizon]);

  const effectiveCapital = simulatedCapital;
  const isCustomCapitalDiff = Math.abs(simulatedCapital - portfolioValue) > 0.01;

  const prediction = useMemo(() => {
    if (!analytics) return null;
    return computePortfolioPredictions(analytics, effectiveCapital, {
      model: returnModel,
      confidenceLevel,
      periodicContributionUsd: periodicContribution,
    });
  }, [analytics, effectiveCapital, returnModel, confidenceLevel, periodicContribution]);

  const activeHorizon: HorizonSummaryCard | null = useMemo(() => {
    if (!prediction) return null;
    return prediction.horizons.find((h) => h.id === selectedHorizon) ?? prediction.horizons[0];
  }, [prediction, selectedHorizon]);

  const activeAssets = useMemo(() => {
    if (!prediction || !activeHorizon) return [];
    return [...(prediction.assetProjectionsByHorizon[activeHorizon.id] ?? [])].sort(
      (a, b) => b.weight - a.weight,
    );
  }, [prediction, activeHorizon]);

  // Loading skeleton state
  if (loadingMarket) {
    return (
      <div className="space-y-5">
        <div className="h-28 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-32 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
        <div className="h-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  // Empty state when < 2 assets are selected
  if (!analytics || !prediction || !activeHorizon) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/60 dark:border-indigo-800 flex items-center justify-center mx-auto">
          <CalendarRange className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="space-y-1.5 max-w-lg mx-auto">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Predicción Multi-Plazo sin activos activos
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Registra el capital de tu cuenta y selecciona al menos 2 activos reales de Yahoo Finance
            para proyectar el valor de tu portafolio en periodos diarios, semanales, mensuales,
            trimestrales, semestrales y anuales.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={onOpenOnboarding}
            className="px-5 py-2.5 rounded-xl bg-[#635BFF] hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Registrar valor y activos
          </button>
          <button
            type="button"
            onClick={onNavigateBuild}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Ir a Construir Portafolio
          </button>
        </div>
      </div>
    );
  }

  // Interactive SVG Trajectory Geometry
  const chartW = 760;
  const chartH = 290;
  const padL = 66;
  const padR = 22;
  const padT = 20;
  const padB = 34;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const timeline = activeHorizon.timeline;
  const maxStep = Math.max(1, timeline.length - 1);

  const allValues = timeline.flatMap((pt) => [
    pt.pessimisticValue,
    pt.expectedValue,
    pt.optimisticValue,
    pt.contributedCapital,
  ]);
  const rawMinY = Math.min(...allValues);
  const rawMaxY = Math.max(...allValues);
  const spanY = Math.max(1, rawMaxY - rawMinY);
  const minY = Math.max(0, rawMinY - spanY * 0.08);
  const maxY = rawMaxY + spanY * 0.08;
  const effectiveSpanY = Math.max(1, maxY - minY);

  const xAt = (stepIdx: number) => padL + (stepIdx / maxStep) * innerW;
  const yAt = (val: number) => padT + innerH - ((val - minY) / effectiveSpanY) * innerH;

  const expectedLinePath = timeline
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(pt.stepIndex).toFixed(2)} ${yAt(pt.expectedValue).toFixed(2)}`)
    .join(' ');

  const medianLinePath = timeline
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(pt.stepIndex).toFixed(2)} ${yAt(pt.medianValue).toFixed(2)}`)
    .join(' ');

  const contributedLinePath = timeline
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(pt.stepIndex).toFixed(2)} ${yAt(pt.contributedCapital).toFixed(2)}`)
    .join(' ');

  const optimisticLinePath = timeline
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(pt.stepIndex).toFixed(2)} ${yAt(pt.optimisticValue).toFixed(2)}`)
    .join(' ');

  const pessimisticLinePath = timeline
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(pt.stepIndex).toFixed(2)} ${yAt(pt.pessimisticValue).toFixed(2)}`)
    .join(' ');

  const bandAreaPath =
    timeline
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(pt.stepIndex).toFixed(2)} ${yAt(pt.optimisticValue).toFixed(2)}`)
      .join(' ') +
    ' ' +
    [...timeline]
      .reverse()
      .map((pt) => `L ${xAt(pt.stepIndex).toFixed(2)} ${yAt(pt.pessimisticValue).toFixed(2)}`)
      .join(' ') +
    ' Z';

  const yTicks = Array.from({ length: 5 }, (_, idx) => minY + (effectiveSpanY * idx) / 4);
  const xTickStep = timeline.length <= 9 ? 1 : timeline.length <= 14 ? 2 : 5;

  const inspectedPoint: PredictionStepPoint =
    hoveredStepIdx !== null && timeline[hoveredStepIdx]
      ? timeline[hoveredStepIdx]
      : timeline[timeline.length - 1];

  const handleExportProjectionCSV = () => {
    const rows = [
      ['Portafolio', portfolioName],
      ['Plazo Seleccionado', `${activeHorizon.title} (${activeHorizon.horizonLabel})`],
      [
        'Modelo de Retorno',
        returnModel === 'random_forest' ? 'Random Forest Predictivo' : 'Markowitz Historico',
      ],
      ['Banda de Confianza (%)', String(confidenceLevel)],
      ['Capital Inicial Simulado (USD)', effectiveCapital.toFixed(2)],
      ['Aporte por Periodo (USD)', periodicContribution.toFixed(2)],
      ['Retorno Anual Estimado (%)', (prediction.annualExpectedReturn * 100).toFixed(2)],
      ['Volatilidad Anual (%)', (prediction.annualVolatility * 100).toFixed(2)],
      [],
      [
        'Periodo',
        'Anos Transcurridos',
        'Capital Aportado (USD)',
        'Escenario Pesimista (USD)',
        'Mediana P50 (USD)',
        'Valor Esperado (USD)',
        'Escenario Optimista (USD)',
        'Ganancia Esperada (USD)',
        'Retorno Acumulado (%)',
      ],
      ...activeHorizon.timeline.map((pt) => [
        pt.label,
        pt.yearsElapsed.toFixed(4),
        pt.contributedCapital.toFixed(2),
        pt.pessimisticValue.toFixed(2),
        pt.medianValue.toFixed(2),
        pt.expectedValue.toFixed(2),
        pt.optimisticValue.toFixed(2),
        pt.expectedGainUsd.toFixed(2),
        pt.expectedReturnPct.toFixed(2),
      ]),
    ];

    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Prediccion_${activeHorizon.id}_${portfolioName.replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header & Interactive Parameters Bar */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Predicción de Portafolio Multi-Plazo
              </h2>
              <button
                type="button"
                onClick={() => setShowMethodInfo((v) => !v)}
                aria-label="Ver metodología matemática"
                className="text-slate-400 hover:text-[#635BFF] cursor-pointer"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
              {portfolioName} · μ = {(prediction.annualExpectedReturn * 100).toFixed(2)}% anual · σ ={' '}
              {(prediction.annualVolatility * 100).toFixed(2)}% anual · Sharpe{' '}
              {prediction.sharpeRatio.toFixed(2)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportProjectionCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV ({activeHorizon.title})</span>
            </button>
          </div>
        </div>

        {showMethodInfo && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Las proyecciones se calculan mediante Movimiento Browniano Geométrico (GBM) log-normal
            con momentos exactos recursivos (Fenton-Wilkinson) para soportar aportes periódicos:
            <span className="font-mono ml-1">
              V(t) ~ LogNormal(μt − ½σ²t, σ√t)
            </span>
            . Los escenarios Pesimista/Optimista corresponden a los cuantiles bilaterales del nivel
            de confianza elegido. Simulación cuantitativa basada en datos de mercado; no garantiza
            rendimientos futuros.
          </div>
        )}

        {/* Zero Capital Notice */}
        {portfolioValue <= 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/70 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start sm:items-center gap-2.5">
              <Coins className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                El capital registrado de tu cuenta es <strong className="font-mono">$0</strong>.
                Ingresa un capital simulado abajo o registra tu inversión real para ver montos en USD.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSimulatedCapital(25000)}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer whitespace-nowrap"
              >
                Simular $25,000
              </button>
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 font-semibold cursor-pointer whitespace-nowrap"
              >
                Configurar cuenta
              </button>
            </div>
          </div>
        )}

        {/* Simulation Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 pt-1">
          {/* Modelo de retorno */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              Modelo de retorno (μ)
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setReturnModel('historical')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  returnModel === 'historical'
                    ? 'bg-white dark:bg-slate-900 text-[#635BFF] dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Markowitz
              </button>
              <button
                type="button"
                onClick={() => setReturnModel('random_forest')}
                className={`inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  returnModel === 'random_forest'
                    ? 'bg-white dark:bg-slate-900 text-[#635BFF] dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>Random Forest</span>
              </button>
            </div>
          </div>

          {/* Banda de confianza */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              Intervalo de confianza
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {([80, 90, 95] as PredictionConfidenceLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setConfidenceLevel(lvl)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                    confidenceLevel === lvl
                      ? 'bg-white dark:bg-slate-900 text-[#635BFF] dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {lvl}%
                </button>
              ))}
            </div>
          </div>

          {/* Capital Inicial Simulado */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="pred-capital-input"
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider"
              >
                Capital inicial (USD)
              </label>
              {isCustomCapitalDiff && (
                <button
                  type="button"
                  onClick={() => setSimulatedCapital(portfolioValue)}
                  className="inline-flex items-center gap-1 text-[11px] text-[#635BFF] hover:underline font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Real ({formatUsd(portfolioValue)})</span>
                </button>
              )}
            </div>
            <input
              id="pred-capital-input"
              type="number"
              min={0}
              max={1000000000}
              step={500}
              value={simulatedCapital}
              onChange={(e) => {
                const raw = Number(e.target.value);
                setSimulatedCapital(
                  Number.isFinite(raw) ? Math.min(1000000000, Math.max(0, raw)) : 0,
                );
              }}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-[#635BFF]"
            />
          </div>

          {/* Aporte Periódico */}
          <div className="space-y-1.5">
            <label
              htmlFor="pred-contrib-input"
              className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider"
            >
              Aporte por {activeHorizon.stepUnitSingular} (USD)
            </label>
            <input
              id="pred-contrib-input"
              type="number"
              min={0}
              max={10000000}
              step={50}
              value={periodicContribution}
              onChange={(e) => {
                const raw = Number(e.target.value);
                setPeriodicContribution(
                  Number.isFinite(raw) ? Math.min(10000000, Math.max(0, raw)) : 0,
                );
              }}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-[#635BFF]"
            />
          </div>
        </div>
      </section>

      {/* 6-Horizon Summary Comparison Matrix */}
      <section aria-label="Resumen comparativo por plazo" className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            ¿Qué pasaría con tu portafolio en cada periodo? (Haz clic para inspeccionar)
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Confianza {confidenceLevel}% · Base {formatUsd(effectiveCapital)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {prediction.horizons.map((h) => {
            const isSelected = h.id === activeHorizon.id;
            const gainPositive = h.onePeriodGainUsd >= 0;

            return (
              <button
                key={h.id}
                type="button"
                onClick={() => setSelectedHorizon(h.id)}
                className={`text-left rounded-2xl p-4 border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 border-[#635BFF] ring-1 ring-[#635BFF]/40'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {h.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Próximo {h.shortLabel} · Serie {h.horizonLabel}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-mono tabular-nums font-semibold px-2 py-0.5 rounded-md ${
                      gainPositive
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {h.onePeriodReturnPct >= 0 ? '+' : ''}
                    {h.onePeriodReturnPct.toFixed(2)}%
                  </span>
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatUsd(h.onePeriodExpectedValue, h.id === 'daily' ? 2 : 0)}
                  </div>
                  <div
                    className={`text-xs font-mono tabular-nums font-semibold ${
                      gainPositive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatSignedUsd(h.onePeriodGainUsd, h.id === 'daily' ? 2 : 0)}
                  </div>
                </div>

                <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>
                    Rango: {formatCompactUsd(h.onePeriodPessimisticValue)} –{' '}
                    {formatCompactUsd(h.onePeriodOptimisticValue)}
                  </span>
                  <span>σp {h.onePeriodVolatilityPct.toFixed(2)}%</span>
                </div>

                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>Al cierre ({h.horizonLabel}):</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formatUsd(h.fullHorizonEndExpectedValue)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Interactive SVG Trajectory Fan Chart */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#635BFF]" />
              <span>
                Trayectoria Proyectada — Plazo {activeHorizon.title} ({activeHorizon.horizonLabel})
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pasa el cursor sobre cualquier periodo para inspeccionar el valor esperado y las bandas
              al {confidenceLevel}% de confianza.
            </p>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#635BFF] inline-block" />
              <span>Valor esperado</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500 inline-block" />
              <span>Mediana (P50)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-xs bg-[#635BFF]/18 border border-[#635BFF]/40 inline-block" />
              <span>Banda {confidenceLevel}%</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t border-dashed border-slate-400 inline-block" />
              <span>Capital aportado</span>
            </span>
          </div>
        </div>

        {/* Live Inspected Period Readout Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-2.5 px-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-xs">
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Periodo</div>
            <div className="font-bold text-slate-900 dark:text-white font-mono">
              {inspectedPoint.label}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Escenario Pesimista</div>
            <div className="font-bold text-rose-600 dark:text-rose-400 font-mono tabular-nums">
              {formatUsd(inspectedPoint.pessimisticValue)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Mediana (P50)</div>
            <div className="font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {formatUsd(inspectedPoint.medianValue)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Valor Esperado</div>
            <div className="font-bold text-[#635BFF] dark:text-indigo-400 font-mono tabular-nums">
              {formatUsd(inspectedPoint.expectedValue)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Escenario Optimista</div>
            <div className="font-bold text-indigo-700 dark:text-indigo-300 font-mono tabular-nums">
              {formatUsd(inspectedPoint.optimisticValue)}
            </div>
          </div>
        </div>

        {/* Responsive SVG Fan Chart */}
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full min-w-[540px] h-auto select-none"
            role="img"
            aria-label={`Gráfico de predicción del portafolio en plazo ${activeHorizon.title}`}
            onMouseLeave={() => setHoveredStepIdx(null)}
          >
            {/* Horizontal Grid Lines & Y-Axis Labels */}
            {yTicks.map((tickVal, idx) => {
              const y = yAt(tickVal);
              return (
                <g key={idx}>
                  <line
                    x1={padL}
                    x2={chartW - padR}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 dark:fill-slate-400 text-[10.5px] font-mono"
                  >
                    {formatCompactUsd(tickVal)}
                  </text>
                </g>
              );
            })}

            {/* Shaded Confidence Cone */}
            <path d={bandAreaPath} fill="#635BFF" fillOpacity={0.13} />

            {/* Confidence Envelope Borders */}
            <path
              d={optimisticLinePath}
              fill="none"
              stroke="#635BFF"
              strokeOpacity={0.4}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <path
              d={pessimisticLinePath}
              fill="none"
              stroke="#E11D48"
              strokeOpacity={0.45}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />

            {/* Contributed Capital Baseline */}
            <path
              d={contributedLinePath}
              fill="none"
              stroke="#94A3B8"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />

            {/* Median (P50) Curve */}
            <path
              d={medianLinePath}
              fill="none"
              stroke="#10B981"
              strokeWidth={1.75}
              strokeLinejoin="round"
            />

            {/* Primary Expected Value Curve */}
            <path
              d={expectedLinePath}
              fill="none"
              stroke="#635BFF"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />

            {/* Active Crosshair */}
            {hoveredStepIdx !== null && timeline[hoveredStepIdx] && (
              <line
                x1={xAt(hoveredStepIdx)}
                x2={xAt(hoveredStepIdx)}
                y1={padT}
                y2={chartH - padB}
                stroke="#635BFF"
                strokeOpacity={0.45}
                strokeWidth={1.2}
                strokeDasharray="3 3"
              />
            )}

            {/* Interactive Data Points & X-Axis Labels */}
            {timeline.map((pt, idx) => {
              const cx = xAt(pt.stepIndex);
              const cyExp = yAt(pt.expectedValue);
              const isHovered = hoveredStepIdx === idx;
              const showLabel =
                idx === 0 || idx === timeline.length - 1 || idx % xTickStep === 0;
              const colWidth = innerW / Math.max(1, timeline.length);

              return (
                <g key={pt.stepIndex}>
                  {showLabel && (
                    <text
                      x={cx}
                      y={chartH - 10}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                    >
                      {pt.label}
                    </text>
                  )}

                  {(isHovered || timeline.length <= 14 || idx === timeline.length - 1) && (
                    <circle
                      cx={cx}
                      cy={cyExp}
                      r={isHovered ? 5 : 3}
                      fill={isHovered ? '#635BFF' : '#FFFFFF'}
                      stroke="#635BFF"
                      strokeWidth={2}
                    />
                  )}

                  {isHovered && (
                    <>
                      <circle
                        cx={cx}
                        cy={yAt(pt.optimisticValue)}
                        r={3.5}
                        fill="#635BFF"
                      />
                      <circle
                        cx={cx}
                        cy={yAt(pt.pessimisticValue)}
                        r={3.5}
                        fill="#E11D48"
                      />
                    </>
                  )}

                  {/* Invisible hover hit column */}
                  <rect
                    x={cx - colWidth / 2}
                    y={padT}
                    width={Math.max(10, colWidth)}
                    height={innerH}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoveredStepIdx(idx)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Bottom Data Grids: Period-by-Period Table + Per-Asset Projected Value */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Step-by-step Table */}
        <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Proyección Paso a Paso — {activeHorizon.title}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Evolución del capital periodo por periodo ({activeHorizon.horizonLabel})
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {timeline.length - 1} periodos
            </span>
          </div>

          <div className="max-h-[380px] overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/95 text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Periodo</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Aportado</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Pesimista</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Esperado</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Optimista</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Var. %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono tabular-nums">
                {timeline.map((pt) => {
                  const pos = pt.expectedReturnPct >= 0;
                  return (
                    <tr
                      key={pt.stepIndex}
                      onMouseEnter={() => setHoveredStepIdx(pt.stepIndex)}
                      onMouseLeave={() => setHoveredStepIdx(null)}
                      className={`transition-colors ${
                        hoveredStepIdx === pt.stepIndex
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-sans font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {pt.label}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400">
                        {formatUsd(pt.contributedCapital)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400">
                        {formatUsd(pt.pessimisticValue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                        {formatUsd(pt.expectedValue)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-indigo-600 dark:text-indigo-400">
                        {formatUsd(pt.optimisticValue)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-semibold ${
                          pt.stepIndex === 0
                            ? 'text-slate-400'
                            : pos
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {pt.stepIndex === 0
                          ? '0.00%'
                          : `${pos ? '+' : ''}${pt.expectedReturnPct.toFixed(2)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Per-Asset Projected Contribution Table */}
        <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Contribución Esperada por Activo
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Valor asignado hoy vs cierre proyectado ({activeHorizon.horizonLabel})
            </p>
          </div>

          <div className="max-h-[380px] overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/95 text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Activo</th>
                  <th className="py-2.5 px-2.5 font-semibold text-right">Peso</th>
                  <th className="py-2.5 px-2.5 font-semibold text-right">Hoy</th>
                  <th className="py-2.5 px-2.5 font-semibold text-right">{activeHorizon.shortLabel}</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Cierre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono tabular-nums">
                {activeAssets.map((asset) => {
                  const pos = asset.projectedGainFullHorizonUsd >= 0;
                  return (
                    <tr
                      key={asset.symbol}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {asset.symbol}
                        </div>
                        <div className="font-sans text-[10.5px] text-slate-500 dark:text-slate-400 truncate max-w-[115px]">
                          μ {(asset.annualReturn * 100).toFixed(1)}% · σ{' '}
                          {(asset.annualVolatility * 100).toFixed(1)}%
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-slate-700 dark:text-slate-300">
                        {(asset.weight * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-slate-600 dark:text-slate-400">
                        {formatUsd(asset.currentAllocatedUsd)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-slate-800 dark:text-slate-200">
                        {formatUsd(asset.projectedValueOnePeriod)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {formatUsd(asset.projectedValueFullHorizon)}
                        </div>
                        <div
                          className={`text-[10.5px] ${
                            pos
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {formatSignedUsd(asset.projectedGainFullHorizonUsd)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
