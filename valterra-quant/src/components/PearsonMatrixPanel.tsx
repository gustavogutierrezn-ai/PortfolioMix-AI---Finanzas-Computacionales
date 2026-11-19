import { useState } from 'react';
import type { PortfolioAnalyticsResult } from '../types/quant';

interface PearsonMatrixPanelProps {
  analytics: PortfolioAnalyticsResult;
}

function getCorrelationColor(val: number, isDiagonal: boolean): string {
  if (isDiagonal) return 'bg-slate-900 dark:bg-indigo-600 text-white';
  if (val >= 0.75) return 'bg-rose-100 dark:bg-rose-950/70 text-rose-900 dark:text-rose-200';
  if (val >= 0.45) return 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200';
  if (val >= 0.15) return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200';
  if (val >= -0.15) return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200';
  return 'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-950 dark:text-emerald-100';
}

export function PearsonMatrixPanel({ analytics }: PearsonMatrixPanelProps) {
  const { pearson } = analytics;
  const [selectedCell, setSelectedCell] = useState<{ i: number; j: number }>({
    i: 0,
    j: pearson.symbols.length > 1 ? 1 : 0,
  });

  const safeI = Math.min(selectedCell.i, pearson.symbols.length - 1);
  const safeJ = Math.min(selectedCell.j, pearson.symbols.length - 1);
  const pairPearson = pearson.matrix[safeI]?.[safeJ] ?? 0;
  const pairCov = pearson.covarianceMatrix[safeI]?.[safeJ] ?? 0;
  const symA = pearson.symbols[safeI] ?? '';
  const symB = pearson.symbols[safeJ] ?? '';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Interactive Pearson N x N Heatmap */}
      <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Matriz de Correlación de Pearson (ρ)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Coeficiente lineal calculado sobre retornos diarios sincronizados · Haz clic en
              cualquier celda para inspeccionar su covarianza.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
            ρ promedio: <strong className="text-slate-900 dark:text-white">{pearson.avgPairwiseCorrelation.toFixed(3)}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs font-mono tabular-nums">
            <thead>
              <tr>
                <th className="p-2 text-left text-slate-500 dark:text-slate-400 font-medium">Activo</th>
                {pearson.symbols.map((sym) => (
                  <th key={sym} className="p-2 text-center font-semibold text-slate-800 dark:text-slate-200">
                    {sym}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pearson.symbols.map((rowSym, i) => (
                <tr key={rowSym} className="border-t border-slate-100 dark:border-slate-800">
                  <th className="p-2 text-left font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {rowSym}
                  </th>
                  {pearson.symbols.map((colSym, j) => {
                    const val = pearson.matrix[i][j];
                    const isDiag = i === j;
                    const isSelected = safeI === i && safeJ === j;
                    return (
                      <td key={`${rowSym}-${colSym}`} className="p-1">
                        <button
                          type="button"
                          onClick={() => setSelectedCell({ i, j })}
                          className={`w-full py-2 px-1.5 rounded-md text-center transition-transform cursor-pointer ${getCorrelationColor(
                            val,
                            isDiag,
                          )} ${isSelected ? 'ring-2 ring-indigo-600 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
                        >
                          {val.toFixed(2)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
          <span>
            Par con menor correlación:{' '}
            <strong className="font-mono text-emerald-700 dark:text-emerald-400">
              {pearson.minCorrelationPair.a} / {pearson.minCorrelationPair.b} (
              {pearson.minCorrelationPair.value.toFixed(2)})
            </strong>
          </span>
          <span>
            Par con mayor correlación:{' '}
            <strong className="font-mono text-rose-700 dark:text-rose-400">
              {pearson.maxCorrelationPair.a} / {pearson.maxCorrelationPair.b} (
              {pearson.maxCorrelationPair.value.toFixed(2)})
            </strong>
          </span>
        </div>
      </div>

      {/* Variance & Covariance Decomposition */}
      <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Descomposición de Varianza Ponderada
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Efecto matemático de la correlación de Pearson sobre el riesgo total de la cartera.
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Inspección de Par Seleccionado
            </div>
            <div className="text-base font-mono font-semibold text-slate-900 dark:text-white">
              {symA} ↔ {symB}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Pearson (ρ)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white text-sm">
                  {pairPearson.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Covarianza Anual</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white text-sm">
                  {pairCov.toFixed(5)}
                </span>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div className="py-3 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Varianza Ponderada (wᵀΣw)</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                {(analytics.weightedVariance * 100).toFixed(2)}%²
              </span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Varianza Sin Covarianzas (∑wᵢ²σᵢ²)</span>
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {(analytics.naiveSumVariance * 100).toFixed(2)}%²
              </span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Desviación Estándar (σₚ)</span>
              <span className="font-mono tabular-nums font-semibold text-indigo-700 dark:text-indigo-400">
                {(analytics.standardDeviation * 100).toFixed(2)}%
              </span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Reducción por Diversificación</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                −{analytics.diversificationBenefitPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-3 border-t border-slate-100 dark:border-slate-800">
          La varianza ponderada incorpora los términos cruzados 2·wᵢ·wⱼ·ρᵢⱼ·σᵢ·σⱼ. Cuando los
          activos mantienen correlaciones de Pearson bajas o negativas, la desviación estándar
          resultante cae por debajo del promedio ponderado individual.
        </p>
      </div>
    </div>
  );
}
