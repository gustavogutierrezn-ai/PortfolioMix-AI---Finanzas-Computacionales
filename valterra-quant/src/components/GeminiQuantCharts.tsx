import { useMemo, useState } from 'react';
import { Maximize2, PieChart, TrendingUp, X } from 'lucide-react';
import type {
  AssetRiskMetrics,
  GeminiKnnChartData,
  GeminiRandomForestChartData,
  MarkowitzFrontierResult,
} from '../types/quant';
import { ASSET_COLORS } from './DistributionDonut';
import { MarkowitzChart } from './MarkowitzChart';

const CLUSTER_COLORS = ['#635BFF', '#10B981', '#F59E0B'];

interface RandomForestGeminiChartProps {
  data: GeminiRandomForestChartData;
  rfSharpe: number;
}

export function RandomForestGeminiChart({
  data,
  rfSharpe,
}: RandomForestGeminiChartProps) {
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const sortedPoints = [...(data.points || [])].sort(
    (a, b) => b.rfWeightPct - a.rfWeightPct,
  );

  const renderSvg = (width: number, height: number, large: boolean) => {
    const padL = 46;
    const padR = 16;
    const padT = 18;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxWeight = Math.max(
      35,
      ...sortedPoints.map((p) => p.rfWeightPct),
    );
    const maxRet = Math.max(
      20,
      ...sortedPoints.map((p) => Math.abs(p.rfPredictedReturnPct)),
    );

    const barGap = 10;
    const barW = Math.max(
      14,
      (plotW - barGap * Math.max(0, sortedPoints.length - 1)) /
        Math.max(1, sortedPoints.length),
    );

    const activePoint =
      sortedPoints.find((p) => p.ticker === hoveredTicker) || sortedPoints[0];

    return (
      <div className="space-y-2.5">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none overflow-visible"
          role="img"
          aria-label={data.chartTitle}
        >
          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((frac) => {
            const y = padT + plotH * (1 - frac);
            const val = Math.round(maxWeight * frac);
            return (
              <g key={frac}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  className="stroke-slate-200 dark:stroke-slate-700"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[9px] font-mono tabular-nums"
                >
                  {val}%
                </text>
              </g>
            );
          })}

          {/* Bars for RF Weight & Line/Dots for Predicted Return */}
          {sortedPoints.map((pt, idx) => {
            const x = padL + idx * (barW + barGap);
            const barH = Math.max(4, (pt.rfWeightPct / maxWeight) * plotH);
            const yBar = padT + plotH - barH;
            const retNorm = Math.max(
              0,
              Math.min(1, (pt.rfPredictedReturnPct + maxRet * 0.2) / (maxRet * 1.2)),
            );
            const yDot = padT + plotH - retNorm * plotH;
            const isHovered = pt.ticker === (hoveredTicker ?? sortedPoints[0]?.ticker);

            return (
              <g
                key={pt.ticker}
                onMouseEnter={() => setHoveredTicker(pt.ticker)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={yBar}
                  width={barW}
                  height={barH}
                  rx={5}
                  fill={isHovered ? '#5243E5' : '#818CF8'}
                  fillOpacity={isHovered ? 0.95 : 0.72}
                />
                <text
                  x={x + barW / 2}
                  y={yBar - 5}
                  textAnchor="middle"
                  className="fill-slate-700 dark:fill-slate-200 text-[9px] font-mono font-semibold tabular-nums"
                >
                  {pt.rfWeightPct.toFixed(0)}%
                </text>
                <circle
                  cx={x + barW / 2}
                  cy={yDot}
                  r={large ? 5 : 4}
                  fill="#10B981"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
                <text
                  x={x + barW / 2}
                  y={padT + plotH + 14}
                  textAnchor="middle"
                  className="fill-slate-700 dark:fill-slate-300 text-[10px] font-mono font-semibold"
                >
                  {pt.ticker}
                </text>
              </g>
            );
          })}

          {/* X Axis Label */}
          <text
            x={padL + plotW / 2}
            y={height - 3}
            textAnchor="middle"
            className="fill-slate-400 text-[9px]"
          >
            {data.xAxisLabel}
          </text>
        </svg>

        {activePoint && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 text-[11px] font-mono tabular-nums">
            <span className="font-semibold text-slate-900 dark:text-white">
              {activePoint.ticker} · {activePoint.roleTag}
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              Peso RF {activePoint.rfWeightPct.toFixed(1)}% · μ{' '}
              {activePoint.rfPredictedReturnPct.toFixed(1)}% · Sharpe{' '}
              {activePoint.sharpe.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/70 bg-white dark:bg-slate-900 p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
              {data.chartTitle}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {data.chartSubtitle}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Ampliar gráfico Random Forest"
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 inline-block" />
            Peso RF (%)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Retorno Predicho RF
          </span>
          <span className="ml-auto font-mono font-semibold text-indigo-600 dark:text-indigo-400">
            Sharpe {rfSharpe.toFixed(2)}
          </span>
        </div>

        {renderSvg(295, 175, false)}

        <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            Factor clave ({data.topDriverLabel}):{' '}
          </span>
          {data.insight}
        </div>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {data.chartTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {data.chartSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Cerrar vista ampliada"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderSvg(560, 260, true)}
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {data.insight}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

interface KnnGeminiChartProps {
  data: GeminiKnnChartData;
}

export function KnnGeminiChart({ data }: KnnGeminiChartProps) {
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const points = data.points || [];
  const activePoint =
    points.find((p) => p.ticker === hoveredTicker) || points[0];

  const renderSvg = (width: number, height: number, large: boolean) => {
    const padL = 42;
    const padR = 18;
    const padT = 18;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const vols = points.map((p) => p.volatilityPct);
    const rets = points.map((p) => p.expectedReturnPct);
    const minX = Math.max(0, Math.min(...vols, 5) - 3);
    const maxX = Math.max(...vols, 25) + 4;
    const minY = Math.min(...rets, 0) - 3;
    const maxY = Math.max(...rets, 20) + 4;

    const toX = (v: number) =>
      padL + ((v - minX) / Math.max(1e-4, maxX - minX)) * plotW;
    const toY = (r: number) =>
      padT + plotH - ((r - minY) / Math.max(1e-4, maxY - minY)) * plotH;

    const pointMap = new Map(points.map((p) => [p.ticker, p]));

    // Collect undirected nearest-neighbor links
    const edgeSet = new Set<string>();
    const edges: Array<{ from: (typeof points)[number]; to: (typeof points)[number] }> = [];
    for (const p of points) {
      for (const nTicker of p.nearestNeighbors || []) {
        const target = pointMap.get(nTicker);
        if (!target) continue;
        const key = [p.ticker, target.ticker].sort().join('--');
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ from: p, to: target });
        }
      }
    }

    return (
      <div className="space-y-2.5">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none overflow-visible"
          role="img"
          aria-label={data.chartTitle}
        >
          {/* Grid */}
          {[0, 0.5, 1].map((frac) => {
            const y = padT + plotH * (1 - frac);
            const yVal = minY + (maxY - minY) * frac;
            const x = padL + plotW * frac;
            const xVal = minX + (maxX - minX) * frac;
            return (
              <g key={frac}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  className="stroke-slate-200 dark:stroke-slate-700"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[9px] font-mono tabular-nums"
                >
                  {yVal.toFixed(0)}%
                </text>
                <text
                  x={x}
                  y={padT + plotH + 14}
                  textAnchor="middle"
                  className="fill-slate-400 text-[9px] font-mono tabular-nums"
                >
                  {xVal.toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* KNN Edges connecting nearest neighbors */}
          {edges.map((e, idx) => {
            const highlighted =
              hoveredTicker === e.from.ticker || hoveredTicker === e.to.ticker;
            return (
              <line
                key={idx}
                x1={toX(e.from.volatilityPct)}
                y1={toY(e.from.expectedReturnPct)}
                x2={toX(e.to.volatilityPct)}
                y2={toY(e.to.expectedReturnPct)}
                stroke={highlighted ? '#635BFF' : '#94A3B8'}
                strokeOpacity={highlighted ? 0.9 : 0.45}
                strokeWidth={highlighted ? 2 : 1.2}
                strokeDasharray="4 3"
              />
            );
          })}

          {/* Asset Nodes */}
          {points.map((pt) => {
            const cx = toX(pt.volatilityPct);
            const cy = toY(pt.expectedReturnPct);
            const color =
              CLUSTER_COLORS[Math.abs(pt.clusterIndex) % CLUSTER_COLORS.length];
            const isHovered = pt.ticker === hoveredTicker;

            return (
              <g
                key={pt.ticker}
                onMouseEnter={() => setHoveredTicker(pt.ticker)}
                className="cursor-pointer"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? (large ? 9 : 7.5) : large ? 7 : 5.5}
                  fill={color}
                  stroke="#FFFFFF"
                  strokeWidth={1.8}
                />
                <text
                  x={cx}
                  y={cy - (large ? 11 : 9)}
                  textAnchor="middle"
                  className="fill-slate-800 dark:fill-slate-100 text-[10px] font-mono font-bold"
                >
                  {pt.ticker}
                </text>
              </g>
            );
          })}

          <text
            x={padL + plotW / 2}
            y={height - 3}
            textAnchor="middle"
            className="fill-slate-400 text-[9px]"
          >
            {data.xAxisLabel}
          </text>
        </svg>

        {activePoint && (
          <div className="px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 text-[11px] space-y-0.5">
            <div className="flex items-center justify-between font-mono tabular-nums">
              <span className="font-semibold text-slate-900 dark:text-white">
                {activePoint.ticker} · {activePoint.clusterLabel}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                Dist. KNN {activePoint.neighborDistance.toFixed(2)}
              </span>
            </div>
            <div className="text-slate-600 dark:text-slate-300 font-mono tabular-nums">
              Vecinos cercanos (K={data.kValue}):{' '}
              <span className="font-semibold">
                {(activePoint.nearestNeighbors || []).join(', ') || '—'}
              </span>{' '}
              · σ {activePoint.volatilityPct.toFixed(1)}% · μ{' '}
              {activePoint.expectedReturnPct.toFixed(1)}%
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-800/70 bg-white dark:bg-slate-900 p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
              {data.chartTitle}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {data.chartSubtitle}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Ampliar gráfico KNN"
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Cluster legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600 dark:text-slate-300">
          {(data.clusters || []).map((c) => (
            <span key={c.clusterIndex} className="inline-flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{
                  backgroundColor:
                    CLUSTER_COLORS[Math.abs(c.clusterIndex) % CLUSTER_COLORS.length],
                }}
              />
              <span>{c.clusterName}</span>
            </span>
          ))}
        </div>

        {renderSvg(295, 190, false)}

        <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed pt-1 border-t border-slate-100 dark:border-slate-800">
          {data.insight}
        </div>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {data.chartTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {data.chartSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Cerrar vista ampliada KNN"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderSvg(560, 280, true)}
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {data.insight}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

interface PortfolioPieDecisionChartProps {
  assets: AssetRiskMetrics[];
  portfolioValue: number;
}

export function PortfolioPieDecisionChart({
  assets,
  portfolioValue,
}: PortfolioPieDecisionChartProps) {
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const slices = useMemo(() => {
    const totalW = assets.reduce((s, a) => s + Math.max(0, a.weight), 0) || 1;
    let startAngle = -Math.PI / 2;
    return assets.map((asset, idx) => {
      const frac = Math.max(0, asset.weight) / totalW;
      const angle = frac * Math.PI * 2;
      const endAngle = startAngle + angle;
      const midAngle = startAngle + angle / 2;
      const slice = {
        symbol: asset.symbol,
        name: asset.name,
        weight: frac,
        amount: frac * portfolioValue,
        startAngle,
        endAngle,
        midAngle,
        color: ASSET_COLORS[idx % ASSET_COLORS.length],
      };
      startAngle = endAngle;
      return slice;
    });
  }, [assets, portfolioValue]);

  const activeSlice =
    slices.find((s) => s.symbol === hoveredSymbol) || slices[0] || null;

  const renderPie = (size: number) => {
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.41;

    const describeArcWedge = (startA: number, endA: number, radius: number) => {
      if (endA - startA >= Math.PI * 1.999) {
        return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`;
      }
      const x1 = cx + radius * Math.cos(startA);
      const y1 = cy + radius * Math.sin(startA);
      const x2 = cx + radius * Math.cos(endA);
      const y2 = cy + radius * Math.sin(endA);
      const largeArc = endA - startA > Math.PI ? 1 : 0;
      return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    };

    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto select-none overflow-visible"
        role="img"
        aria-label="Gráfico de pastel de distribución del portafolio"
      >
        {slices.map((s) => {
          const isHovered = activeSlice?.symbol === s.symbol;
          const pop = isHovered ? 4 : 0;
          const tx = Math.cos(s.midAngle) * pop;
          const ty = Math.sin(s.midAngle) * pop;
          return (
            <path
              key={s.symbol}
              d={describeArcWedge(s.startAngle, s.endAngle, r)}
              fill={s.color}
              stroke="#FFFFFF"
              strokeWidth={1.6}
              transform={`translate(${tx.toFixed(2)}, ${ty.toFixed(2)})`}
              onMouseEnter={() => setHoveredSymbol(s.symbol)}
              className="transition-transform duration-150 cursor-pointer"
            />
          );
        })}
      </svg>
    );
  };

  return (
    <>
      <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/70 bg-white dark:bg-slate-900 p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <PieChart className="w-3.5 h-3.5 text-[#635BFF] shrink-0" />
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
              Gráfico de Pastel (Distribución)
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Ampliar gráfico de pastel"
            className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-5">{renderPie(118)}</div>
          <div className="col-span-7 space-y-1 text-[11px] font-mono tabular-nums">
            {slices.map((s) => (
              <div
                key={s.symbol}
                onMouseEnter={() => setHoveredSymbol(s.symbol)}
                className={`flex items-center justify-between gap-1.5 px-1.5 py-0.5 rounded-md cursor-pointer ${
                  activeSlice?.symbol === s.symbol
                    ? 'bg-indigo-50 dark:bg-indigo-950/60'
                    : ''
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {s.symbol}
                  </span>
                </span>
                <span className="text-slate-600 dark:text-slate-300 shrink-0">
                  {(s.weight * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {activeSlice && (
          <div className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 text-[11px] font-mono tabular-nums flex items-center justify-between text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">
              {activeSlice.symbol}
            </span>
            <span>
              {(activeSlice.weight * 100).toFixed(1)}% · $
              {Math.round(activeSlice.amount).toLocaleString('en-US')}
            </span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Distribución del Portafolio (Gráfico de Pastel)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Capital total: ${Math.round(portfolioValue).toLocaleString('en-US')} USD
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Cerrar gráfico de pastel ampliado"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-2">{renderPie(240)}</div>
            <div className="space-y-1.5 text-xs font-mono tabular-nums">
              {slices.map((s) => (
                <div
                  key={s.symbol}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                >
                  <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                    <span
                      className="w-2.5 h-2.5 rounded-xs"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.symbol}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {(s.weight * 100).toFixed(1)}% · $
                    {Math.round(s.amount).toLocaleString('en-US')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface CompactMarkowitzDecisionChartProps {
  frontier: MarkowitzFrontierResult;
}

export function CompactMarkowitzDecisionChart({
  frontier,
}: CompactMarkowitzDecisionChartProps) {
  const [expanded, setExpanded] = useState(false);

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
    const yMin = Math.min(...allRets) - 0.02;
    const yMax = Math.max(...allRets) + 0.03;

    const width = 295;
    const height = 165;
    const padL = 36;
    const padR = 12;
    const padT = 12;
    const padB = 24;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const toX = (risk: number) =>
      padL + ((risk - rMin) / (rMax - rMin || 1)) * plotW;
    const toY = (ret: number) =>
      padT + ((yMax - ret) / (yMax - yMin || 1)) * plotH;

    const curvePath = frontier.frontierCurve
      .map(
        (p, idx) =>
          `${idx === 0 ? 'M' : 'L'} ${toX(p.risk).toFixed(1)} ${toY(p.expectedReturn).toFixed(1)}`,
      )
      .join(' ');

    return { width, height, padL, padR, padT, padB, plotW, plotH, rMin, rMax, yMin, yMax, toX, toY, curvePath };
  }, [frontier]);

  return (
    <>
      <div className="rounded-xl border border-violet-200/80 dark:border-violet-800/70 bg-white dark:bg-slate-900 p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <TrendingUp className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
              Frontera Eficiente de Markowitz
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Ampliar frontera eficiente de Markowitz"
            className="p-1 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <svg
          viewBox={`0 0 ${geo.width} ${geo.height}`}
          className="w-full h-auto select-none overflow-visible"
          role="img"
          aria-label="Frontera eficiente de Markowitz para toma de decisiones"
        >
          {[0, 0.5, 1].map((frac) => {
            const y = geo.padT + geo.plotH * (1 - frac);
            const yVal = geo.yMin + (geo.yMax - geo.yMin) * frac;
            const x = geo.padL + geo.plotW * frac;
            const xVal = geo.rMin + (geo.rMax - geo.rMin) * frac;
            return (
              <g key={frac}>
                <line
                  x1={geo.padL}
                  y1={y}
                  x2={geo.width - geo.padR}
                  y2={y}
                  className="stroke-slate-200 dark:stroke-slate-800"
                  strokeDasharray="3 3"
                />
                <text
                  x={geo.padL - 5}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[8.5px] font-mono"
                >
                  {(yVal * 100).toFixed(0)}%
                </text>
                <text
                  x={x}
                  y={geo.height - 6}
                  textAnchor="middle"
                  className="fill-slate-400 text-[8.5px] font-mono"
                >
                  {(xVal * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}

          {frontier.cloud.slice(0, 260).map((pt, idx) => (
            <circle
              key={idx}
              cx={geo.toX(pt.risk)}
              cy={geo.toY(pt.expectedReturn)}
              r={1.35}
              fill="#8B5CF6"
              fillOpacity={0.24}
            />
          ))}

          {geo.curvePath && (
            <path
              d={geo.curvePath}
              fill="none"
              stroke="#6D28D9"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}

          <circle
            cx={geo.toX(frontier.minRiskPoint.risk)}
            cy={geo.toY(frontier.minRiskPoint.expectedReturn)}
            r={4.2}
            fill="#22C55E"
            stroke="#FFFFFF"
            strokeWidth="1.4"
          />
          <circle
            cx={geo.toX(frontier.maxSharpePoint.risk)}
            cy={geo.toY(frontier.maxSharpePoint.expectedReturn)}
            r={4.6}
            fill="#7C3AED"
            stroke="#FFFFFF"
            strokeWidth="1.4"
          />
          <circle
            cx={geo.toX(frontier.currentPoint.risk)}
            cy={geo.toY(frontier.currentPoint.expectedReturn)}
            r={4.8}
            fill="#3B82F6"
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        </svg>

        <div className="grid grid-cols-2 gap-1.5 text-[10.5px] font-mono tabular-nums">
          <div className="px-2 py-1 rounded-lg bg-violet-50/70 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300">
            Óptimo S {frontier.maxSharpePoint.sharpe.toFixed(2)} (σ{' '}
            {(frontier.maxSharpePoint.risk * 100).toFixed(1)}%)
          </div>
          <div className="px-2 py-1 rounded-lg bg-blue-50/70 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300">
            Actual S {frontier.currentPoint.sharpe.toFixed(2)} (σ{' '}
            {(frontier.currentPoint.risk * 100).toFixed(1)}%)
          </div>
        </div>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Frontera Eficiente de Markowitz — Toma de Decisiones
              </h3>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Cerrar frontera eficiente ampliada"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <MarkowitzChart frontier={frontier} />
          </div>
        </div>
      )}
    </>
  );
}

