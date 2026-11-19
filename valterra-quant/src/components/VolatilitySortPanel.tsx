import { useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import type { PortfolioAnalyticsResult } from '../types/quant';

interface VolatilitySortPanelProps {
  analytics: PortfolioAnalyticsResult;
  onApplyInverseVolatility: () => void;
}

type SortKey =
  | 'volatilityDesc'
  | 'volatilityAsc'
  | 'varianceDesc'
  | 'sharpeDesc'
  | 'riskContribDesc'
  | 'rfWeightDesc';

export function VolatilitySortPanel({
  analytics,
  onApplyInverseVolatility,
}: VolatilitySortPanelProps) {
  const [sortBy, setSortBy] = useState<SortKey>('volatilityDesc');

  const sortedAssets = useMemo(() => {
    const copy = [...analytics.assets];
    switch (sortBy) {
      case 'volatilityDesc':
        return copy.sort((a, b) => b.standardDeviation - a.standardDeviation);
      case 'volatilityAsc':
        return copy.sort((a, b) => a.standardDeviation - b.standardDeviation);
      case 'varianceDesc':
        return copy.sort((a, b) => b.individualVariance - a.individualVariance);
      case 'sharpeDesc':
        return copy.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
      case 'riskContribDesc':
        return copy.sort((a, b) => b.componentRiskPct - a.componentRiskPct);
      case 'rfWeightDesc':
        return copy.sort((a, b) => b.rfWeight - a.rfWeight);
      default:
        return copy;
    }
  }, [analytics.assets, sortBy]);

  const maxStd = Math.max(...analytics.assets.map((a) => a.standardDeviation), 0.01);

  const sortButtons: Array<{ id: SortKey; label: string }> = [
    { id: 'volatilityDesc', label: 'Mayor Volatilidad (σ)' },
    { id: 'volatilityAsc', label: 'Menor Volatilidad (σ)' },
    { id: 'varianceDesc', label: 'Varianza Individual (σ²)' },
    { id: 'sharpeDesc', label: 'Ratio Sharpe' },
    { id: 'riskContribDesc', label: 'Contribución al Riesgo' },
    { id: 'rfWeightDesc', label: 'Peso Random Forest' },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Sorteo de Volatilidad, Varianza Individual y Métricas de Riesgo por Activo
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ordenamiento cuantitativo de activos según su desviación estándar anualizada, varianza
            individual, ratio de Sharpe y contribución marginal al riesgo total.
          </p>
        </div>

        <button
          type="button"
          onClick={onApplyInverseVolatility}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ArrowDownUp className="w-3.5 h-3.5" />
          <span>Aplicar Paridad de Volatilidad (1/σ)</span>
        </button>
      </div>

      {/* Sort Selector */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
        {sortButtons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => setSortBy(btn.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sortBy === btn.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* High-density Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
              <th className="py-2.5 pr-4">Rango Vol.</th>
              <th className="py-2.5 pr-4">Activo</th>
              <th className="py-2.5 px-3 text-right">Precio</th>
              <th className="py-2.5 px-3 text-right">Peso Activo</th>
              <th className="py-2.5 px-3 text-right">Peso RF</th>
              <th className="py-2.5 px-3 text-right">Retorno Anual</th>
              <th className="py-2.5 px-3 text-right">Varianza Ind. (σ²)</th>
              <th className="py-2.5 px-3 text-right">Desv. Estándar (σ)</th>
              <th className="py-2.5 px-3 text-right">Sharpe Ind.</th>
              <th className="py-2.5 px-3 text-right">Beta</th>
              <th className="py-2.5 pl-3 text-right">Contrib. Riesgo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {sortedAssets.map((asset) => {
              const barPct = (asset.standardDeviation / maxStd) * 100;
              return (
                <tr key={asset.symbol} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 pr-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400">
                    #{asset.volatilityRank}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-mono font-semibold text-slate-900 dark:text-white">{asset.symbol}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 max-w-[180px] truncate">
                      {asset.name} · {asset.source}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    <div className="text-slate-900 dark:text-slate-100">${asset.price.toFixed(2)}</div>
                    <div
                      className={`text-xs ${
                        asset.changePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {asset.changePct >= 0 ? '+' : ''}
                      {asset.changePct.toFixed(2)}%
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                    {(asset.weight * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-indigo-700 dark:text-indigo-400 font-medium">
                    {(asset.rfWeight * 100).toFixed(1)}%
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-mono tabular-nums ${
                      asset.expectedReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {(asset.expectedReturn * 100).toFixed(2)}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {(asset.individualVariance * 100).toFixed(2)}%²
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    <div className="text-slate-900 dark:text-slate-100 font-medium">
                      {(asset.standardDeviation * 100).toFixed(2)}%
                    </div>
                    <div className="mt-1 h-1 w-20 ml-auto bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-600 rounded-full"
                        style={{ width: `${Math.min(100, barPct)}%` }}
                      />
                    </div>
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-mono tabular-nums font-medium ${
                      asset.sharpeRatio >= 0.5
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : asset.sharpeRatio >= 0
                          ? 'text-slate-800 dark:text-slate-200'
                          : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {asset.sharpeRatio.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {asset.beta.toFixed(2)}
                  </td>
                  <td className="py-3 pl-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    {asset.componentRiskPct.toFixed(1)}%
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
