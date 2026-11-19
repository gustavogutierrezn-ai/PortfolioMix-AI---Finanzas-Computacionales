import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Check,
  Eye,
  FolderArchive,
  FolderOpen,
  LogOut,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  SavedPortfolioDoc,
  SavedReportDoc,
  SavedStressTestDoc,
  UserProfileDoc,
} from '../types/quant';

type ReportFilter = 'all' | 'financial_analysis' | 'stress_test' | 'portfolios';

type PendingDeletion =
  | { kind: 'report'; id: string; label: string }
  | { kind: 'portfolio'; id: string; label: string }
  | { kind: 'legacy_stress'; id: string; label: string };

function formatFirestoreDate(value: unknown): string {
  if (!value) return 'Reciente';
  const maybeTs = value as { toDate?: () => Date; seconds?: number };
  let date: Date | null = null;
  if (typeof maybeTs.toDate === 'function') {
    date = maybeTs.toDate();
  } else if (typeof maybeTs.seconds === 'number') {
    date = new Date(maybeTs.seconds * 1000);
  } else if (value instanceof Date) {
    date = value;
  }
  if (!date || Number.isNaN(date.getTime())) return 'Reciente';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

interface HistoryViewProps {
  user: User | null;
  reports: SavedReportDoc[];
  portfolios: SavedPortfolioDoc[];
  stressTests: SavedStressTestDoc[];
  onSignIn: () => void;
  onLoadPortfolio: (p: SavedPortfolioDoc) => void;
  onRunStressOnPortfolio: (p: SavedPortfolioDoc) => void;
  onDeleteReport: (id: string) => Promise<void>;
  onDeletePortfolio: (id: string) => Promise<void>;
  onDeleteStressTest: (id: string) => Promise<void>;
}

export function HistoryView({
  user,
  reports,
  portfolios,
  stressTests,
  onSignIn,
  onLoadPortfolio,
  onRunStressOnPortfolio,
  onDeleteReport,
  onDeletePortfolio,
  onDeleteStressTest,
}: HistoryViewProps) {
  const [filter, setFilter] = useState<ReportFilter>('all');
  const [selectedReport, setSelectedReport] = useState<SavedReportDoc | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDeletion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const financialCount = useMemo(
    () => reports.filter((r) => r.reportType === 'financial_analysis').length,
    [reports],
  );
  const stressCount = useMemo(
    () => reports.filter((r) => r.reportType === 'stress_test').length,
    [reports],
  );

  const filteredReports = useMemo(() => {
    if (filter === 'financial_analysis') {
      return reports.filter((r) => r.reportType === 'financial_analysis');
    }
    if (filter === 'stress_test') {
      return reports.filter((r) => r.reportType === 'stress_test');
    }
    return reports;
  }, [reports, filter]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      if (pendingDelete.kind === 'report') {
        await onDeleteReport(pendingDelete.id);
        if (selectedReport?.id === pendingDelete.id) {
          setSelectedReport(null);
        }
      } else if (pendingDelete.kind === 'portfolio') {
        await onDeletePortfolio(pendingDelete.id);
      } else {
        await onDeleteStressTest(pendingDelete.id);
      }
      setPendingDelete(null);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'No se pudo eliminar el registro en Firestore. Intenta nuevamente.',
      );
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  if (!user) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <FolderArchive className="w-8 h-8 text-[#635BFF] mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Reportes Guardados en Firebase
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Inicia sesión con Google para almacenar de forma privada y aislada tus reportes de
          análisis financiero, pruebas de estrés y carteras optimizadas.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#635BFF] hover:bg-[#5243E5] text-white text-xs font-semibold cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Acceder con Google</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="underline font-semibold cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Main Saved Reports Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Reportes Guardados ({reports.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Análisis financieros y pruebas de estrés con parámetros completos sincronizados para{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{user.email}</span>
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            {(
              [
                { id: 'all', label: `Todos (${reports.length})` },
                { id: 'financial_analysis', label: `Análisis (${financialCount})` },
                { id: 'stress_test', label: `Estrés (${stressCount})` },
                { id: 'portfolios', label: `Carteras (${portfolios.length})` },
              ] as Array<{ id: ReportFilter; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  filter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-[#635BFF] dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reports Grid / List */}
        {filter !== 'portfolios' &&
          (filteredReports.length === 0 ? (
            <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                No hay reportes en esta categoría
              </div>
              <p>
                Usa <strong>Guardar Reporte</strong> en el Dashboard o{' '}
                <strong>Guardar Reporte de Estrés</strong> en Pruebas de Estrés para conservar tus
                análisis reproducibles.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((rep) => {
                const isStress = rep.reportType === 'stress_test';
                return (
                  <div
                    key={rep.id}
                    className="p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                            isStress
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                              : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60'
                          }`}
                        >
                          {isStress ? (
                            <ShieldAlert className="w-3 h-3" />
                          ) : (
                            <BarChart3 className="w-3 h-3" />
                          )}
                          <span>{isStress ? 'Prueba de Estrés' : 'Análisis Financiero'}</span>
                        </span>

                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {rep.portfolioName}
                        </h3>

                        {isStress && rep.stressParams?.scenarioName && (
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            · {rep.stressParams.scenarioName}
                          </span>
                        )}

                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          · {formatFirestoreDate(rep.createdAt)}
                        </span>
                      </div>

                      {/* Tickers & Exact Weights */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {rep.tickers.map((t, idx) => (
                          <span
                            key={`${rep.id}-${t}`}
                            className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                          >
                            {t} {((rep.weights[idx] ?? 0) * 100).toFixed(1)}%
                          </span>
                        ))}
                      </div>

                      {/* Key Metrics */}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-mono tabular-nums">
                        <span>
                          <span className="text-slate-500 dark:text-slate-400">Retorno: </span>
                          <strong
                            className={
                              rep.metrics.expectedReturn >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }
                          >
                            {(rep.metrics.expectedReturn * 100).toFixed(2)}%
                          </strong>
                        </span>
                        <span>
                          <span className="text-slate-500 dark:text-slate-400">Volatilidad: </span>
                          <strong className="text-indigo-600 dark:text-indigo-400">
                            {(rep.metrics.volatility * 100).toFixed(2)}%
                          </strong>
                        </span>
                        <span>
                          <span className="text-slate-500 dark:text-slate-400">Sharpe: </span>
                          <strong className="text-slate-900 dark:text-white">
                            {rep.metrics.sharpeRatio.toFixed(2)}
                          </strong>
                        </span>
                        <span>
                          <span className="text-slate-500 dark:text-slate-400">VaR 95%: </span>
                          <strong className="text-rose-600 dark:text-rose-400">
                            −{(rep.metrics.var95 * 100).toFixed(1)}%
                          </strong>
                        </span>
                        <span>
                          <span className="text-slate-500 dark:text-slate-400">CVaR 95%: </span>
                          <strong className="text-rose-600 dark:text-rose-400">
                            −{(rep.metrics.cvar95 * 100).toFixed(1)}%
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedReport(rep)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#635BFF]" />
                        <span>Ver parámetros</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({
                            kind: 'report',
                            id: rep.id,
                            label: `${rep.portfolioName} (${
                              isStress ? rep.stressParams?.scenarioName || 'Estrés' : 'Análisis'
                            })`,
                          })
                        }
                        aria-label={`Eliminar reporte ${rep.portfolioName}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-300 text-xs cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {/* Saved Portfolios Section (when filter === 'portfolios' or 'all') */}
        {(filter === 'portfolios' || filter === 'all') && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Carteras Guardadas ({portfolios.length})
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Puedes recargarlas en el Dashboard o evaluarlas en Pruebas de Estrés
              </span>
            </div>

            {portfolios.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-500 dark:text-slate-400">
                Aún no has guardado carteras en tu cuenta.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 pr-4">Nombre</th>
                      <th className="py-2.5 px-3">Activos y Pesos</th>
                      <th className="py-2.5 px-3 text-right">Rend. Esperado</th>
                      <th className="py-2.5 px-3 text-right">Volatilidad (σ)</th>
                      <th className="py-2.5 px-3 text-right">Sharpe</th>
                      <th className="py-2.5 pl-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {portfolios.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white">
                          {p.name}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {p.tickers
                            .map((t, idx) => `${t} ${((p.weights[idx] ?? 0) * 100).toFixed(0)}%`)
                            .join(' · ')}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                          {(p.expectedReturn * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                          {(p.standardDeviation * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                          {p.sharpeRatio.toFixed(2)}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onLoadPortfolio(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium hover:bg-indigo-100 cursor-pointer"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              <span>Abrir</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onRunStressOnPortfolio(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-medium hover:bg-amber-100 cursor-pointer"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Estresar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDelete({
                                  kind: 'portfolio',
                                  id: p.id,
                                  label: p.name,
                                })
                              }
                              aria-label={`Eliminar cartera ${p.name}`}
                              className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legacy Stress Tests Archive (only if any legacy records exist) */}
      {stressTests.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Registro Histórico Anterior de Estrés ({stressTests.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Simulaciones previas conservadas para compatibilidad
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {stressTests.map((st) => (
              <div key={st.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {st.scenarioName} — {st.portfolioName}
                  </div>
                  <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    Choque {st.marketShockPct}% · Vol {st.volMultiplier.toFixed(2)}× · Retorno
                    Estrés {(st.stressedReturn * 100).toFixed(1)}% · VaR 95% −
                    {(st.var95 * 100).toFixed(1)}%
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPendingDelete({
                      kind: 'legacy_stress',
                      id: st.id,
                      label: `${st.scenarioName} — ${st.portfolioName}`,
                    })
                  }
                  aria-label={`Eliminar simulación ${st.scenarioName}`}
                  className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reproducibility Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[#635BFF]">
                  {selectedReport.reportType === 'stress_test'
                    ? 'Reporte de Prueba de Estrés'
                    : 'Reporte de Análisis Financiero'}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedReport.portfolioName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Creado: {formatFirestoreDate(selectedReport.createdAt)} · Capital ref.: $
                  {Math.round(selectedReport.portfolioValue).toLocaleString('en-US')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                aria-label="Cerrar detalle"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                <div className="text-slate-500 dark:text-slate-400">Rendimiento</div>
                <div className="font-mono font-bold text-sm mt-0.5 text-slate-900 dark:text-white">
                  {(selectedReport.metrics.expectedReturn * 100).toFixed(2)}%
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                <div className="text-slate-500 dark:text-slate-400">Volatilidad / Varianza</div>
                <div className="font-mono font-bold text-sm mt-0.5 text-slate-900 dark:text-white">
                  {(selectedReport.metrics.volatility * 100).toFixed(2)}% /{' '}
                  {(selectedReport.metrics.weightedVariance * 100).toFixed(2)}%²
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                <div className="text-slate-500 dark:text-slate-400">Sharpe Ratio</div>
                <div className="font-mono font-bold text-sm mt-0.5 text-slate-900 dark:text-white">
                  {selectedReport.metrics.sharpeRatio.toFixed(2)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                <div className="text-slate-500 dark:text-slate-400">VaR al 95%</div>
                <div className="font-mono font-bold text-sm mt-0.5 text-rose-600 dark:text-rose-400">
                  −{(selectedReport.metrics.var95 * 100).toFixed(2)}%
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                <div className="text-slate-500 dark:text-slate-400">CVaR al 95%</div>
                <div className="font-mono font-bold text-sm mt-0.5 text-rose-600 dark:text-rose-400">
                  −{(selectedReport.metrics.cvar95 * 100).toFixed(2)}%
                </div>
              </div>
              {typeof selectedReport.metrics.estimatedDrawdownPct === 'number' && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                  <div className="text-slate-500 dark:text-slate-400">Drawdown Estimado</div>
                  <div className="font-mono font-bold text-sm mt-0.5 text-rose-600 dark:text-rose-400">
                    {selectedReport.metrics.estimatedDrawdownPct.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            {/* Model Parameters */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-slate-900 dark:text-white">
                Parámetros del Modelo Cuantitativo (Reproducibilidad)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                <div>Perfil: {selectedReport.modelParams.riskPreference}</div>
                <div>Objetivo: {selectedReport.modelParams.objective}</div>
                <div>Ventana: {selectedReport.modelParams.range.toUpperCase()}</div>
                <div>Rf: {(selectedReport.modelParams.riskFreeRate * 100).toFixed(2)}%</div>
                <div>Árboles RF: {selectedReport.modelParams.treeCount}</div>
                <div>Pearson prom.: {selectedReport.modelParams.avgPearson.toFixed(2)}</div>
              </div>
            </div>

            {/* Stress Parameters if Stress Test */}
            {selectedReport.stressParams && (
              <div className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2 text-xs">
                <div className="font-semibold text-amber-900 dark:text-amber-300">
                  Parámetros de Simulación de Estrés: {selectedReport.stressParams.scenarioName}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  <div>Choque: {selectedReport.stressParams.marketShockPct}%</div>
                  <div>Vol. Mult: {selectedReport.stressParams.volMultiplier.toFixed(2)}×</div>
                  <div>Corr. ρ: {selectedReport.stressParams.correlationTarget.toFixed(2)}</div>
                  <div>Tasa: {selectedReport.stressParams.rateShiftBps} bps</div>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  Metodología drawdown: {selectedReport.stressParams.drawdownMethodology}
                </div>
              </div>
            )}

            {/* Asset Details Table */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3">Activo</th>
                    <th className="py-2 px-3 text-right">Peso</th>
                    <th className="py-2 px-3 text-right">Rend.</th>
                    <th className="py-2 px-3 text-right">Vol.</th>
                    <th className="py-2 px-3 text-right">Sharpe</th>
                    {selectedReport.reportType === 'stress_test' && (
                      <th className="py-2 px-3 text-right">Impacto</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                  {selectedReport.assetDetails.map((a) => (
                    <tr key={a.symbol}>
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                        {a.symbol}
                      </td>
                      <td className="py-2 px-3 text-right">{(a.weight * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3 text-right">
                        {(a.expectedReturn * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right">{(a.volatility * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3 text-right">{a.sharpe.toFixed(2)}</td>
                      {selectedReport.reportType === 'stress_test' && (
                        <td
                          className={`py-2 px-3 text-right ${
                            (a.projectedLossPct ?? 0) >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {typeof a.projectedLossPct === 'number'
                            ? `${a.projectedLossPct >= 0 ? '+' : ''}${a.projectedLossPct.toFixed(1)}%`
                            : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Before Deleting */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Confirmar eliminación
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                ¿Estás seguro de que deseas eliminar{' '}
                <strong className="text-slate-900 dark:text-white">{pendingDelete.label}</strong> de
                tu cuenta de Firebase? Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AccountViewProps {
  user: User | null;
  profile: UserProfileDoc | null;
  portfoliosCount: number;
  stressTestsCount: number;
  onSignIn: () => void;
  onSignOut: () => void;
  onUpdateProfileSettings: (roleLabel: string, defaultCapital: number) => Promise<void>;
}

export function AccountView({
  user,
  profile,
  portfoliosCount,
  stressTestsCount,
  onSignIn,
  onSignOut,
  onUpdateProfileSettings,
}: AccountViewProps) {
  const [roleLabel, setRoleLabel] = useState(profile?.roleLabel || 'Estudiante');
  const [capitalInput, setCapitalInput] = useState(
    String(profile?.defaultCapital ?? 100000),
  );
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (profile?.roleLabel) {
      setRoleLabel(profile.roleLabel);
    }
    if (typeof profile?.defaultCapital === 'number' && Number.isFinite(profile.defaultCapital)) {
      setCapitalInput(String(profile.defaultCapital));
    }
  }, [profile?.roleLabel, profile?.defaultCapital]);

  if (!user) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <ShieldCheck className="w-8 h-8 text-indigo-600 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Conecta tu Cuenta de Google
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Autentícate con Firebase Google Auth para administrar tu perfil de inversionista, capital
          base y portafolios guardados.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
        >
          <span>Iniciar sesión con Google</span>
        </button>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawNum = Number(capitalInput);
    const parsedCap = Number.isFinite(rawNum)
      ? Math.min(1000000000, Math.max(0, rawNum))
      : 0;
    setSaving(true);
    try {
      await onUpdateProfileSettings(roleLabel.trim().slice(0, 60) || 'Inversionista', parsedCap);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-4">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'Perfil'}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover border-2 border-indigo-200 dark:border-indigo-700"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-600 text-white text-xl font-bold flex items-center justify-center">
              {(user.displayName || user.email || 'U').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {user.displayName || 'Usuario Google'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {user.email}
            </p>
            <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {user.emailVerified ? 'Cuenta Google verificada' : 'Pendiente de verificación'}
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">UID Firebase</span>
            <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
              {user.uid}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Portafolios guardados</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-white">
              {portfoliosCount}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Reportes y estrés</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-white">
              {stressTestsCount}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Cerrar sesión de Google</span>
        </button>
      </div>

      <form
        onSubmit={handleSave}
        className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5"
      >
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Preferencias de Cuenta en Firestore
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Estos valores se sincronizan con tu perfil real y actualizan tu encabezado y valor base
            del portafolio.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Perfil / Rol de cuenta
            </label>
            <input
              type="text"
              maxLength={60}
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="Ej. Estudiante, Analista..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Capital Base del Portafolio (USD)
            </label>
            <input
              type="number"
              min={0}
              max={1000000000}
              step="any"
              value={capitalInput}
              onChange={(e) => setCapitalInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
        >
          {savedOk ? (
            <>
              <Check className="w-4 h-4" />
              <span>Cambios guardados en Firestore</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar Preferencias'}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
