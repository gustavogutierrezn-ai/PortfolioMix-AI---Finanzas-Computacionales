import { useMemo, useState } from 'react';
import { RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { PortfolioAnalyticsResult } from '../types/quant';

interface RandomForestPanelProps {
  analytics: PortfolioAnalyticsResult;
  weightMode: 'rf' | 'equal' | 'invVol' | 'custom';
  onApplyPresetWeights: (mode: 'rf' | 'equal' | 'invVol') => void;
  onUpdateCustomWeight: (symbol: string, pctValue: number) => void;
}

export function RandomForestPanel({
  analytics,
  weightMode,
  onApplyPresetWeights,
  onUpdateCustomWeight,
}: RandomForestPanelProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const chartGeometry = useMemo(() => {
    const opt = analytics.equityCurveOptimal;
    const eq = analytics.equityCurveEqual;
    const cur = analytics.equityCurveCurrent;
    const len = opt.length;
    if (len < 2) {
      return null;
    }

    const allVals = [...opt, ...eq, ...cur];
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const pad = Math.max(2, (maxVal - minVal) * 0.12);
    const yMin = minVal - pad;
    const yMax = maxVal + pad;

    const width = 760;
    const height = 270;
    const left = 48;
    const right = 18;
    const top = 16;
    const bottom = 32;
    const plotW = width - left - right;
    const plotH = height - top - bottom;

    const toX = (i: number) => left + (i / (len - 1)) * plotW;
    const toY = (v: number) => top + ((yMax - v) / (yMax - yMin || 1)) * plotH;

    const buildPath = (series: number[]) =>
      series
        .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
        .join(' ');

    const yTicks = 4;
    const gridLines = Array.from({ length: yTicks + 1 }, (_, k) => {
      const val = yMin + ((yMax - yMin) * k) / yTicks;
      return { val, y: toY(val) };
    });

    return {
      width,
      height,
      left,
      top,
      plotW,
      plotH,
      pathOpt: buildPath(opt),
      pathEq: buildPath(eq),
      pathCur: buildPath(cur),
      gridLines,
      toX,
      toY,
      len,
    };
  }, [analytics]);

  const activeIdx =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < analytics.dates.length
      ? hoverIdx
      : analytics.dates.length - 1;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Equity Curve + Feature Importance */}
      <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Desempeño Comparado: Random Forest vs Cartera Actual y 1/N
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Base 100 · {analytics.treeCount} árboles de decisión · R² Out-of-Bag:{' '}
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {analytics.oobR2Score.toFixed(2)}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-600 inline-block" />
              RF Óptima
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-600 inline-block" />
              Activa
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-slate-400 inline-block" />
              1/N
            </span>
          </div>
        </div>

        {chartGeometry && (
          <div className="relative">
            <svg
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              className="w-full h-auto select-none"
              onMouseLeave={() => setHoverIdx(null)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = ((e.clientX - rect.left) / rect.width) * chartGeometry.width;
                const ratio = (relX - chartGeometry.left) / chartGeometry.plotW;
                const idx = Math.round(
                  Math.max(0, Math.min(1, ratio)) * (chartGeometry.len - 1),
                );
                setHoverIdx(idx);
              }}
            >
              {chartGeometry.gridLines.map((line, i) => (
                <g key={i}>
                  <line
                    x1={chartGeometry.left}
                    y1={line.y}
                    x2={chartGeometry.width - 18}
                    y2={line.y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={chartGeometry.left - 8}
                    y={line.y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {line.val.toFixed(0)}
                  </text>
                </g>
              ))}

              <path
                d={chartGeometry.pathEq}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <path
                d={chartGeometry.pathCur}
                fill="none"
                stroke="#059669"
                strokeWidth="2"
              />
              <path
                d={chartGeometry.pathOpt}
                fill="none"
                stroke="#4f46e5"
                strokeWidth="2.25"
              />

              {/* Hover crosshair */}
              <line
                x1={chartGeometry.toX(activeIdx)}
                y1={chartGeometry.top}
                x2={chartGeometry.toX(activeIdx)}
                y2={chartGeometry.top + chartGeometry.plotH}
                stroke="#cbd5e1"
                strokeWidth="1"
              />
              <circle
                cx={chartGeometry.toX(activeIdx)}
                cy={chartGeometry.toY(analytics.equityCurveOptimal[activeIdx])}
                r="4"
                fill="#4f46e5"
              />
              <circle
                cx={chartGeometry.toX(activeIdx)}
                cy={chartGeometry.toY(analytics.equityCurveCurrent[activeIdx])}
                r="3.5"
                fill="#059669"
              />
            </svg>

            <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              <span>Fecha: {analytics.dates[activeIdx]}</span>
              <span>
                RF Óptima:{' '}
                <strong className="text-indigo-700 dark:text-indigo-400">
                  {analytics.equityCurveOptimal[activeIdx]?.toFixed(2)}
                </strong>
              </span>
              <span>
                Activa:{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {analytics.equityCurveCurrent[activeIdx]?.toFixed(2)}
                </strong>
              </span>
              <span>
                Equiponderada:{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {analytics.equityCurveEqual[activeIdx]?.toFixed(2)}
                </strong>
              </span>
            </div>
          </div>
        )}

        {/* Random Forest Feature Importance */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
              Importancia de Factores en el Modelo Random Forest
            </h4>
            <span className="text-xs text-slate-500 dark:text-slate-400">Reducción de impureza MSE</span>
          </div>
          <div className="space-y-2.5">
            {analytics.featureImportances.map((fi) => {
              const pct = fi.importance * 100;
              return (
                <div key={fi.feature} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300">{fi.label}</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(2, pct * 2.4))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Weight Allocator */}
      <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Optimización de Pesos de Cartera
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Compara los pesos sugeridos por Random Forest contra paridad de volatilidad o ajusta
                manualmente.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => onApplyPresetWeights('rf')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                weightMode === 'rf'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Random Forest</span>
            </button>
            <button
              type="button"
              onClick={() => onApplyPresetWeights('invVol')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                weightMode === 'invVol'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Paridad 1/σ</span>
            </button>
            <button
              type="button"
              onClick={() => onApplyPresetWeights('equal')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                weightMode === 'equal'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Equiponderada 1/N</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {analytics.assets.map((asset) => {
              const activePct = asset.weight * 100;
              const rfPct = asset.rfWeight * 100;
              return (
                <div key={asset.symbol} className="py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold font-mono text-slate-900 dark:text-white">
                        {asset.symbol}
                      </span>
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400 truncate">
                        {asset.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums text-xs">
                      <span className="text-slate-400">
                        RF: {rfPct.toFixed(1)}%
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white w-12 text-right">
                        {activePct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={70}
                    step={0.5}
                    value={Number(activePct.toFixed(1))}
                    onChange={(e) =>
                      onUpdateCustomWeight(asset.symbol, Number(e.target.value))
                    }
                    aria-label={`Peso de ${asset.symbol}`}
                    className="w-full accent-indigo-600 cursor-pointer h-1.5"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span>
                      Retorno RF Est.: {(asset.rfPredictedReturn * 100).toFixed(1)}%
                    </span>
                    <span>
                      Riesgo RF Est.: {(asset.rfPredictedRisk * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Sharpe RF Óptimo</div>
            <div className="mt-0.5 text-sm font-mono tabular-nums font-semibold text-indigo-700 dark:text-indigo-400">
              {analytics.rfPortfolioSharpe.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Sharpe Activo</div>
            <div className="mt-0.5 text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
              {analytics.sharpeRatio.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Sharpe 1/N</div>
            <div className="mt-0.5 text-sm font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-400">
              {analytics.equalWeightSharpe.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
