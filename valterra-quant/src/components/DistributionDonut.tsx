import type { AssetRiskMetrics } from '../types/quant';

export const ASSET_COLORS = [
  '#4F46E5', // Indigo
  '#38BDF8', // Sky
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#A855F7', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#6366F1',
  '#0EA5E9',
  '#10B981',
  '#8B5CF6',
  '#F97316',
];

interface DistributionDonutProps {
  assets: AssetRiskMetrics[];
  portfolioValue: number;
}

export function DistributionDonut({
  assets,
  portfolioValue,
}: DistributionDonutProps) {
  const size = 180;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const segments = assets.map((asset, idx) => {
    const fraction = Math.max(0, asset.weight);
    const dash = fraction * circumference;
    const offset = -cumulativeOffset;
    cumulativeOffset += dash;
    return {
      symbol: asset.symbol,
      weight: asset.weight,
      amount: asset.weight * portfolioValue,
      color: ASSET_COLORS[idx % ASSET_COLORS.length],
      dashArray: `${dash} ${circumference}`,
      dashOffset: offset,
    };
  });

  const formattedTotal = `$${Math.round(portfolioValue).toLocaleString('en-US')}`;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between h-full shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
      <div className="space-y-4">
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
          Distribución óptima
        </h3>

        <div className="relative flex items-center justify-center py-2">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            role="img"
            aria-label="Gráfico de distribución del portafolio"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-slate-100 dark:text-slate-800"
              strokeWidth={strokeWidth}
            />
            {segments.map((seg) => (
              <circle
                key={seg.symbol}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                className="transition-all duration-300"
              />
            ))}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">
              {formattedTotal}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Invertidos
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5 text-xs">
        {segments.map((seg) => (
          <div
            key={seg.symbol}
            className="flex items-center justify-between gap-2 font-mono tabular-nums"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {seg.symbol}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-slate-600 dark:text-slate-400 w-11 text-right">
                {(seg.weight * 100).toFixed(1)}%
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 w-16 text-right">
                ${Math.round(seg.amount).toLocaleString('en-US')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
