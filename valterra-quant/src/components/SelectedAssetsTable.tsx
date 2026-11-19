import type { AssetRiskMetrics, OptimizationObjective } from '../types/quant';
import { ASSET_COLORS } from './DistributionDonut';

interface SelectedAssetsTableProps {
  assets: AssetRiskMetrics[];
  objective: OptimizationObjective;
  onUpdateWeight: (symbol: string, pctValue: number) => void;
}

export function SelectedAssetsTable({
  assets,
  objective,
  onUpdateWeight,
}: SelectedAssetsTableProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
          Activos seleccionados
        </h3>
        {objective === 'custom' && (
          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
            Modo personalizado activo: ajusta los pesos directamente
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
              <th className="py-2.5 pr-4">Ticker</th>
              <th className="py-2.5 px-3">Empresa</th>
              <th className="py-2.5 px-3 text-right">Precio actual</th>
              <th className="py-2.5 px-3 text-right">Rend. esperado (μ)</th>
              <th className="py-2.5 px-3 text-right">Volatilidad (σ)</th>
              <th className="py-2.5 pl-3 text-right">Peso óptimo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-[13px]">
            {assets.map((asset, idx) => {
              const color = ASSET_COLORS[idx % ASSET_COLORS.length];
              const pct = asset.weight * 100;
              return (
                <tr
                  key={asset.symbol}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-semibold">
                      {asset.symbol}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-6 h-6 rounded-md text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {asset.symbol.slice(0, 2)}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                        {asset.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    ${asset.price.toFixed(2)}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium ${
                      asset.expectedReturn >= 0
                        ? 'text-slate-800 dark:text-slate-200'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {(asset.expectedReturn * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {(asset.standardDeviation * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    {objective === 'custom' ? (
                      <div className="inline-flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={70}
                          step={0.5}
                          value={Number(pct.toFixed(1))}
                          onChange={(e) =>
                            onUpdateWeight(asset.symbol, Number(e.target.value))
                          }
                          aria-label={`Peso de ${asset.symbol}`}
                          className="w-20 accent-indigo-600 cursor-pointer h-1.5"
                        />
                        <span className="w-11 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    ) : (
                      <span>{pct.toFixed(1)}%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
