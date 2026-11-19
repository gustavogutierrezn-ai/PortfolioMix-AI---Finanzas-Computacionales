import { useMemo, useState } from 'react';
import { Crown, Info } from 'lucide-react';
import type { MarkowitzFrontierResult } from '../types/quant';

interface MarkowitzChartProps {
  frontier: MarkowitzFrontierResult;
}

export function MarkowitzChart({ frontier }: MarkowitzChartProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<{
    risk: number;
    expectedReturn: number;
    sharpe: number;
  } | null>(null);

  const geo = useMemo(() => {
    const allRisks = [
      ...frontier.cloud.map((p) => p.risk),
      ...frontier.frontierCurve.map((p) => p.risk),
      frontier.minRiskPoint.risk,
      frontier.maxSharpePoint.risk,
      frontier.currentPoint.risk,
    ];
    const allRets = [
      ...frontier.cloud.map((p) => p.expectedReturn),
      ...frontier.frontierCurve.map((p) => p.expectedReturn),
      frontier.minRiskPoint.expectedReturn,
      frontier.maxSharpePoint.expectedReturn,
      frontier.currentPoint.expectedReturn,
    ];

    const rMin = Math.max(0.01, Math.min(...allRisks) * 0.85);
    const rMax = Math.max(rMin + 0.05, Math.max(...allRisks) * 1.08);
    const yMin = Math.min(...allRets) - 0.025;
    const yMax = Math.max(...allRets) + 0.035;

    const width = 560;
    const height = 270;
    const left = 52;
    const right = 18;
    const top = 22;
    const bottom = 36;
    const plotW = width - left - right;
    const plotH = height - top - bottom;

    const toX = (risk: number) =>
      left + ((risk - rMin) / (rMax - rMin || 1)) * plotW;
    const toY = (ret: number) =>
      top + ((yMax - ret) / (yMax - yMin || 1)) * plotH;

    const xTicks = Array.from({ length: 6 }, (_, i) => {
      const val = rMin + ((rMax - rMin) * i) / 5;
      return { val, x: toX(val) };
    });

    const yTicks = Array.from({ length: 6 }, (_, i) => {
      const val = yMin + ((yMax - yMin) * i) / 5;
      return { val, y: toY(val) };
    });

    const curvePath = frontier.frontierCurve
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p.risk).toFixed(1)} ${toY(p.expectedReturn).toFixed(1)}`)
      .join(' ');

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotW,
      plotH,
      toX,
      toY,
      xTicks,
      yTicks,
      curvePath,
    };
  }, [frontier]);

  const maxSharpeX = geo.toX(frontier.maxSharpePoint.risk);
  const maxSharpeY = geo.toY(frontier.maxSharpePoint.expectedReturn);
  const curX = geo.toX(frontier.currentPoint.risk);
  const curY = geo.toY(frontier.currentPoint.expectedReturn);
  const minX = geo.toX(frontier.minRiskPoint.risk);
  const minY = geo.toY(frontier.minRiskPoint.expectedReturn);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between h-full shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="relative flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            Frontera eficiente de Markowitz
          </h3>
          <button
            type="button"
            onClick={() => setShowInfo((s) => !s)}
            aria-label="Información sobre la Frontera Eficiente de Markowitz"
            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
          >
            <Info className="w-4 h-4" />
          </button>
          {showInfo && (
            <div className="absolute left-0 top-7 z-30 w-72 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg text-xs text-slate-600 dark:text-slate-300">
              Simulación de 1,200 portafolios sobre retornos y matriz de covarianza reales de Yahoo
              Finance. La curva violeta representa el máximo retorno esperado para cada nivel de
              volatilidad.
            </div>
          )}
        </div>

        {hoverPoint && (
          <div className="text-[11px] font-mono tabular-nums text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-md">
            Ret {(hoverPoint.expectedReturn * 100).toFixed(1)}% · Riesgo{' '}
            {(hoverPoint.risk * 100).toFixed(1)}% · Sharpe {hoverPoint.sharpe.toFixed(2)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-center flex-1">
        <div className="xl:col-span-9 relative">
          <svg
            viewBox={`0 0 ${geo.width} ${geo.height}`}
            className="w-full h-auto overflow-visible select-none"
          >
            {/* Grid lines */}
            {geo.yTicks.map((t, i) => (
              <g key={`y-${i}`}>
                <line
                  x1={geo.left}
                  y1={t.y}
                  x2={geo.width - geo.right}
                  y2={t.y}
                  stroke="currentColor"
                  className="text-slate-200/70 dark:text-slate-800"
                  strokeDasharray="3 3"
                />
                <text
                  x={geo.left - 8}
                  y={t.y + 3}
                  textAnchor="end"
                  className="fill-slate-500 dark:fill-slate-400 text-[9.5px] font-mono"
                >
                  {(t.val * 100).toFixed(1)}%
                </text>
              </g>
            ))}

            {geo.xTicks.map((t, i) => (
              <g key={`x-${i}`}>
                <line
                  x1={t.x}
                  y1={geo.top}
                  x2={t.x}
                  y2={geo.height - geo.bottom}
                  stroke="currentColor"
                  className="text-slate-200/70 dark:text-slate-800"
                  strokeDasharray="3 3"
                />
                <text
                  x={t.x}
                  y={geo.height - geo.bottom + 14}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[9.5px] font-mono"
                >
                  {(t.val * 100).toFixed(1)}%
                </text>
              </g>
            ))}

            {/* Axis Titles */}
            <text
              x={14}
              y={geo.top + geo.plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 14 ${geo.top + geo.plotH / 2})`}
              className="fill-slate-500 dark:fill-slate-400 text-[10px]"
            >
              Rendimiento esperado
            </text>
            <text
              x={geo.left + geo.plotW / 2}
              y={geo.height - 4}
              textAnchor="middle"
              className="fill-slate-500 dark:fill-slate-400 text-[10px]"
            >
              Riesgo (Volatilidad)
            </text>

            {/* Monte Carlo Cloud */}
            {frontier.cloud.map((pt, idx) => (
              <circle
                key={idx}
                cx={geo.toX(pt.risk)}
                cy={geo.toY(pt.expectedReturn)}
                r={1.75}
                fill="#8B5CF6"
                fillOpacity={0.26}
                onMouseEnter={() => setHoverPoint(pt)}
                onMouseLeave={() => setHoverPoint(null)}
                className="cursor-crosshair"
              />
            ))}

            {/* Efficient Frontier Curve */}
            {geo.curvePath && (
              <path
                d={geo.curvePath}
                fill="none"
                stroke="#6D28D9"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}

            {/* Minimum Risk Dot */}
            <circle
              cx={minX}
              cy={minY}
              r={5.5}
              fill="#22C55E"
              stroke="#FFFFFF"
              strokeWidth="2"
              onMouseEnter={() => setHoverPoint(frontier.minRiskPoint)}
              onMouseLeave={() => setHoverPoint(null)}
              className="cursor-pointer"
            />

            {/* Max Sharpe Optimal Dot */}
            <circle
              cx={maxSharpeX}
              cy={maxSharpeY}
              r={6}
              fill="#7C3AED"
              stroke="#FFFFFF"
              strokeWidth="2"
              onMouseEnter={() => setHoverPoint(frontier.maxSharpePoint)}
              onMouseLeave={() => setHoverPoint(null)}
              className="cursor-pointer"
            />

            {/* Current Portfolio Dot */}
            <circle
              cx={curX}
              cy={curY}
              r={6.5}
              fill="#3B82F6"
              stroke="#FFFFFF"
              strokeWidth="2"
              onMouseEnter={() => setHoverPoint(frontier.currentPoint)}
              onMouseLeave={() => setHoverPoint(null)}
              className="cursor-pointer"
            />
          </svg>

          {/* Floating Callouts matching reference layout */}
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
            <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/70 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-800 dark:text-indigo-300">
                <Crown className="w-3.5 h-3.5 shrink-0" />
                <span>Óptimo (Max Sharpe)</span>
              </div>
              <div className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {(frontier.maxSharpePoint.expectedReturn * 100).toFixed(1)}% · σ{' '}
                {(frontier.maxSharpePoint.risk * 100).toFixed(1)}% · S{' '}
                {frontier.maxSharpePoint.sharpe.toFixed(2)}
              </div>
            </div>

            <div className="rounded-xl border border-blue-200/80 dark:border-blue-800/70 bg-blue-50/60 dark:bg-blue-950/40 px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-blue-800 dark:text-blue-300">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shrink-0" />
                <span>Tu portafolio</span>
              </div>
              <div className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {(frontier.currentPoint.expectedReturn * 100).toFixed(1)}% · σ{' '}
                {(frontier.currentPoint.risk * 100).toFixed(1)}% · S{' '}
                {frontier.currentPoint.sharpe.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Right Legend matching screenshot */}
        <div className="xl:col-span-3 space-y-3 text-xs text-slate-600 dark:text-slate-300 pl-1">
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-violet-700 inline-block shrink-0" />
            <span>Frontera eficiente</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-600 inline-block shrink-0" />
            <span>Portafolio óptimo (Max Sharpe)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shrink-0" />
            <span>Mínimo riesgo</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shrink-0" />
            <span>Tu portafolio</span>
          </div>
        </div>
      </div>
    </div>
  );
}
