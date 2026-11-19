import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  Lightbulb,
  Network,
  Send,
  Sparkles,
} from 'lucide-react';
import type {
  GeminiKnnChartData,
  GeminiRandomForestChartData,
  GeminiStructuredAnalysis,
  MarkowitzFrontierResult,
  OptimizationObjective,
  PortfolioAnalyticsResult,
  RiskPreference,
} from '../types/quant';
import type { SidebarTab } from './SidebarNav';
import {
  CompactMarkowitzDecisionChart,
  KnnGeminiChart,
  PortfolioPieDecisionChart,
  RandomForestGeminiChart,
} from './GeminiQuantCharts';

interface GeminiAdvisorPanelProps {
  analytics: PortfolioAnalyticsResult | null;
  frontier: MarkowitzFrontierResult | null;
  currentAppTab: SidebarTab;
  portfolioName: string;
  portfolioValue: number;
  userName: string;
  riskPreference: RiskPreference;
  objective: OptimizationObjective;
  onApplyPresetMode: (mode: 'rf' | 'minRisk') => void;
}

type AdvisorTab = 'analisis' | 'riesgo' | 'sugerencias';

interface ChatMessage {
  id: string;
  role: 'user' | 'gemini';
  text: string;
}

export function GeminiAdvisorPanel({
  analytics,
  frontier,
  currentAppTab,
  portfolioName,
  portfolioValue,
  userName,
  riskPreference,
  objective,
  onApplyPresetMode,
}: GeminiAdvisorPanelProps) {
  const [activeTab, setActiveTab] = useState<AdvisorTab>('analisis');
  const [aiSummary, setAiSummary] = useState<GeminiStructuredAnalysis | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [rfChart, setRfChart] = useState<GeminiRandomForestChartData | null>(null);
  const [rfChartLoading, setRfChartLoading] = useState(false);
  const [rfChartError, setRfChartError] = useState<string | null>(null);

  const [knnChart, setKnnChart] = useState<GeminiKnnChartData | null>(null);
  const [knnChartLoading, setKnnChartLoading] = useState(false);
  const [knnChartError, setKnnChartError] = useState<string | null>(null);

  const [decisionChartsTriggered, setDecisionChartsTriggered] = useState(false);
  const clientChartCacheRef = useRef<Map<string, GeminiRandomForestChartData | GeminiKnnChartData>>(
    new Map(),
  );

  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Quantitative deterministic fallback for summary text when network lags
  const fallbackSummary = useMemo<GeminiStructuredAnalysis | null>(() => {
    if (!analytics) return null;
    const sortedByWeight = [...analytics.assets].sort((a, b) => b.weight - a.weight);
    const topAsset = sortedByWeight[0];
    const highestVol = [...analytics.assets].sort(
      (a, b) => b.standardDeviation - a.standardDeviation,
    )[0];
    const lowestVol = [...analytics.assets].sort(
      (a, b) => a.standardDeviation - b.standardDeviation,
    )[0];

    const topTwoSum =
      (sortedByWeight[0]?.weight ?? 0) + (sortedByWeight[1]?.weight ?? 0);

    return {
      analysisSummary: `El portafolio optimizado tiene un rendimiento esperado de ${(
        analytics.portfolioExpectedReturn * 100
      ).toFixed(1)}% anual con una volatilidad de ${(
        analytics.standardDeviation * 100
      ).toFixed(1)}%, lo que resulta en un Sharpe Ratio de ${analytics.sharpeRatio.toFixed(2)}.`,
      strengths: [
        `Diversificación entre ${analytics.assets
          .slice(0, 4)
          .map((a) => a.symbol)
          .join(', ')} con correlación media de Pearson de ${analytics.pearson.avgPairwiseCorrelation.toFixed(
          2,
        )}.`,
        `Reducción de varianza ponderada de −${analytics.diversificationBenefitPct.toFixed(
          1,
        )}% gracias a covarianzas descorrelacionadas.`,
      ],
      risks: [
        `Concentración principal en ${topAsset.symbol} (${(topAsset.weight * 100).toFixed(
          1,
        )}%) y top-2 de ${(topTwoSum * 100).toFixed(0)}%; ${
          highestVol.symbol
        } aporta la mayor volatilidad (${(highestVol.standardDeviation * 100).toFixed(1)}%).`,
      ],
      suggestion: `Si buscas un perfil más conservador, podrías reducir la exposición en ${
        highestVol.symbol
      } (${(highestVol.weight * 100).toFixed(1)}%) y aumentar ${
        lowestVol.symbol
      }, disminuyendo la desviación estándar manteniendo un buen Sharpe.`,
    };
  }, [analytics]);

  const portfolioPayload = useMemo(() => {
    if (!analytics) return null;
    return {
      userName,
      portfolioName,
      portfolioValue,
      expectedReturnPct: analytics.portfolioExpectedReturn * 100,
      volatilityPct: analytics.standardDeviation * 100,
      sharpeRatio: analytics.sharpeRatio,
      rfPortfolioSharpe: analytics.rfPortfolioSharpe,
      oobR2Score: analytics.oobR2Score,
      treeCount: analytics.treeCount,
      weightedVariancePct: analytics.weightedVariance * 100,
      avgPearson: analytics.pearson.avgPairwiseCorrelation,
      riskFreeRatePct: analytics.riskFreeRate * 100,
      riskPreference,
      objective,
      featureImportances: analytics.featureImportances.map((fi) => ({
        label: fi.label,
        importancePct: fi.importance * 100,
      })),
      assets: analytics.assets.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        weightPct: a.weight * 100,
        rfWeightPct: a.rfWeight * 100,
        expectedReturnPct: a.expectedReturn * 100,
        rfPredictedReturnPct: a.rfPredictedReturn * 100,
        volatilityPct: a.standardDeviation * 100,
        sharpe: a.sharpeRatio,
        beta: a.beta,
        maxDrawdownPct: a.maxDrawdown * 100,
        price: a.price,
      })),
    };
  }, [analytics, userName, portfolioName, portfolioValue, riskPreference, objective]);

  const tickersFingerprint = useMemo(
    () => (analytics ? analytics.assets.map((a) => a.symbol).join(',') : ''),
    [analytics],
  );

  // Clear generated charts and chat if the asset universe changes or empties
  useEffect(() => {
    setRfChart(null);
    setRfChartError(null);
    setKnnChart(null);
    setKnnChartError(null);
    clientChartCacheRef.current.clear();
    if (!tickersFingerprint) {
      setAiSummary(null);
      setChatHistory([]);
      setDecisionChartsTriggered(false);
    }
  }, [tickersFingerprint]);

  const portfolioPayloadRef = useRef(portfolioPayload);
  portfolioPayloadRef.current = portfolioPayload;

  useEffect(() => {
    if (!tickersFingerprint || !portfolioPayloadRef.current) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      const payload = portfolioPayloadRef.current;
      if (!payload) return;
      setSummaryLoading(true);
      try {
        const res = await fetch('/api/gemini/advisor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'summary',
            portfolioContext: payload,
          }),
        });
        if (!res.ok) throw new Error('Gemini unavailable');
        const data = (await res.json()) as GeminiStructuredAnalysis;
        if (!cancelled && data.analysisSummary) {
          setAiSummary(data);
        }
      } catch {
        if (!cancelled) {
          setAiSummary(null);
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      }
    }, 550);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tickersFingerprint]);

  const handleApplyRfAndGenerateChart = async () => {
    if (!portfolioPayload || !analytics) return;
    onApplyPresetMode('rf');
    if (currentAppTab !== 'dashboard') {
      setDecisionChartsTriggered(true);
    }

    const cacheKey = `rf:${tickersFingerprint}:${analytics.rfPortfolioSharpe.toFixed(3)}`;
    const cached = clientChartCacheRef.current.get(cacheKey) as
      | GeminiRandomForestChartData
      | undefined;
    if (cached) {
      setRfChart(cached);
      setRfChartError(null);
      return;
    }

    setRfChartLoading(true);
    setRfChartError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

    try {
      const rfPayload = {
        ...portfolioPayload,
        objective: 'Random Forest',
        assets: portfolioPayload.assets.map((a) => ({
          ...a,
          weightPct: a.rfWeightPct,
        })),
      };
      const res = await fetch('/api/gemini/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chart',
          chartType: 'random_forest',
          portfolioContext: rfPayload,
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as {
        data?: GeminiRandomForestChartData;
        error?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error || 'No se pudo generar el gráfico Random Forest con Gemini.');
      }
      clientChartCacheRef.current.set(cacheKey, json.data);
      setRfChart(json.data);
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setRfChartError(
        isAbort
          ? 'La solicitud tardó demasiado. Presiona reintentar para regenerar el gráfico.'
          : err instanceof Error
            ? err.message
            : 'Error al solicitar el gráfico Random Forest a Gemini.',
      );
    } finally {
      clearTimeout(timeout);
      setRfChartLoading(false);
    }
  };

  const handleGenerateKnnChart = async () => {
    if (!portfolioPayload || !analytics) return;
    if (currentAppTab !== 'dashboard') {
      setDecisionChartsTriggered(true);
    }

    const cacheKey = `knn:${tickersFingerprint}:${analytics.sharpeRatio.toFixed(3)}`;
    const cached = clientChartCacheRef.current.get(cacheKey) as
      | GeminiKnnChartData
      | undefined;
    if (cached) {
      setKnnChart(cached);
      setKnnChartError(null);
      return;
    }

    setKnnChartLoading(true);
    setKnnChartError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

    try {
      const res = await fetch('/api/gemini/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chart',
          chartType: 'knn',
          portfolioContext: portfolioPayload,
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as {
        data?: GeminiKnnChartData;
        error?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error || 'No se pudo generar el gráfico KNN con Gemini.');
      }
      clientChartCacheRef.current.set(cacheKey, json.data);
      setKnnChart(json.data);
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      setKnnChartError(
        isAbort
          ? 'La solicitud tardó demasiado. Presiona reintentar para regenerar el gráfico KNN.'
          : err instanceof Error
            ? err.message
            : 'Error al solicitar el gráfico KNN a Gemini.',
      );
    } finally {
      clearTimeout(timeout);
      setKnnChartLoading(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !portfolioPayload || chatLoading) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      text: trimmed,
    };
    setChatHistory((prev) => [...prev, userMsg]);
    setQuestion('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/gemini/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          question: trimmed,
          portfolioContext: portfolioPayload,
        }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok || !data.answer) {
        throw new Error(data.error || 'No se recibió respuesta de Gemini.');
      }
      setChatHistory((prev) => [
        ...prev,
        { id: `${Date.now()}-g`, role: 'gemini', text: data.answer! },
      ]);
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con el servicio de Gemini.';
      setChatHistory((prev) => [
        ...prev,
        { id: `${Date.now()}-g`, role: 'gemini', text: errMsg },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const displaySummary = aiSummary || fallbackSummary;
  const volSorted = useMemo(
    () =>
      analytics
        ? [...analytics.assets].sort((a, b) => b.standardDeviation - a.standardDeviation)
        : [],
    [analytics],
  );

  return (
    <aside className="w-full xl:w-[360px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
      <div className="space-y-4">
        {/* Gemini Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-indigo-950 dark:to-purple-900/60 border border-indigo-200/60 dark:border-indigo-700/50 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-none">
              Gemini
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tu asesor de inversiones
            </p>
          </div>
        </div>

        {/* Segmented Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80">
          {(
            [
              { id: 'analisis', label: 'Análisis' },
              { id: 'riesgo', label: 'Riesgo' },
              { id: 'sugerencias', label: 'Sugerencias' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id);
                if (t.id === 'sugerencias' && currentAppTab !== 'dashboard') {
                  setDecisionChartsTriggered(true);
                }
              }}
              className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === t.id
                  ? 'bg-gradient-to-r from-[#6D5DF6] to-[#5243E5] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
          {!analytics ? (
            <div className="py-10 px-3 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Portafolio pendiente de configuración
              </p>
              <p>
                Registra el valor de tu portafolio y selecciona al menos 2 activos para activar el
                análisis cuantitativo y los gráficos de Gemini.
              </p>
            </div>
          ) : activeTab === 'analisis' && displaySummary ? (
            <div className="space-y-4 text-[13px] leading-relaxed">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    <BarChart2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Análisis del portafolio</span>
                  </div>
                  {summaryLoading && (
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400">
                      Actualizando...
                    </span>
                  )}
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  {displaySummary.analysisSummary}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Fortalezas</span>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc text-slate-600 dark:text-slate-300">
                  {displaySummary.strengths.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>Riesgos</span>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc text-slate-600 dark:text-slate-300">
                  {displaySummary.risks.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <span>Sugerencia</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  {displaySummary.suggestion}
                </p>
              </div>
            </div>
          ) : activeTab === 'riesgo' ? (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700 space-y-2">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Descomposición de Riesgo Real
                </div>
                <div className="flex justify-between font-mono tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400">Varianza Ponderada</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {(analytics.weightedVariance * 100).toFixed(2)}%²
                  </span>
                </div>
                <div className="flex justify-between font-mono tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400">Desviación Estándar</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {(analytics.standardDeviation * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between font-mono tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400">Correlación Pearson</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {analytics.pearson.avgPairwiseCorrelation.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between font-mono tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400">Reducción Diversif.</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    −{analytics.diversificationBenefitPct.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Sorteo de Volatilidad (Ranking σ)
                </div>
                {volSorted.map((a, idx) => (
                  <div
                    key={a.symbol}
                    className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 font-mono tabular-nums"
                  >
                    <span className="text-slate-700 dark:text-slate-200">
                      #{idx + 1} {a.symbol}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      σ {(a.standardDeviation * 100).toFixed(1)}% · Var{' '}
                      {(a.individualVariance * 100).toFixed(2)}%²
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800 space-y-2">
                <div className="font-semibold text-indigo-900 dark:text-indigo-200">
                  Factores Random Forest ({analytics.treeCount} árboles)
                </div>
                {analytics.featureImportances.slice(0, 4).map((fi) => (
                  <div key={fi.feature} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-700 dark:text-slate-300">{fi.label}</span>
                      <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                        {(fi.importance * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-white dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${Math.min(100, fi.importance * 220)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={handleApplyRfAndGenerateChart}
                  disabled={rfChartLoading}
                  className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {rfChartLoading
                    ? 'Generando gráfico Random Forest con Gemini...'
                    : `Aplicar Optimización Random Forest (Sharpe ${analytics.rfPortfolioSharpe.toFixed(2)})`}
                </button>

                <button
                  type="button"
                  onClick={handleGenerateKnnChart}
                  disabled={knnChartLoading}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Network className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {knnChartLoading
                      ? 'Generando gráfico KNN con Gemini...'
                      : 'Generar gráfico de KNN'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onApplyPresetMode('minRisk');
                    if (currentAppTab !== 'dashboard') {
                      setDecisionChartsTriggered(true);
                    }
                  }}
                  className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold transition-colors cursor-pointer"
                >
                  Aplicar Mínimo Riesgo Markowitz
                </button>
              </div>

              {/* Decision Charts (Pie + Markowitz Frontier) shown when outside Dashboard */}
              {currentAppTab !== 'dashboard' && decisionChartsTriggered && frontier && (
                <div className="space-y-3 pt-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Vista de Decisión Rápida
                  </div>
                  <PortfolioPieDecisionChart
                    assets={analytics.assets}
                    portfolioValue={portfolioValue}
                  />
                  <CompactMarkowitzDecisionChart frontier={frontier} />
                </div>
              )}

              {/* Gemini Random Forest Chart Output */}
              {rfChartError && (
                <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-[11px] text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
                  <span>{rfChartError}</span>
                  <button
                    type="button"
                    onClick={handleApplyRfAndGenerateChart}
                    className="font-semibold underline shrink-0 cursor-pointer"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {rfChart && !rfChartLoading && (
                <RandomForestGeminiChart
                  data={rfChart}
                  rfSharpe={analytics.rfPortfolioSharpe}
                />
              )}

              {/* Gemini KNN Chart Output */}
              {knnChartError && (
                <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-[11px] text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
                  <span>{knnChartError}</span>
                  <button
                    type="button"
                    onClick={handleGenerateKnnChart}
                    className="font-semibold underline shrink-0 cursor-pointer"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {knnChart && !knnChartLoading && <KnnGeminiChart data={knnChart} />}
            </div>
          )}

          {/* Interactive Chat Thread */}
          {chatHistory.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              {chatHistory.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white ml-6'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 mr-4'
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {chatLoading && (
                <div className="text-xs text-slate-400 italic">Gemini está analizando...</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Chat Input */}
      <form
        onSubmit={handleSendChat}
        className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800"
      >
        <div className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 pl-4 pr-1.5 py-1.5 focus-within:border-indigo-500">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pregúntale a Gemini..."
            className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!question.trim() || chatLoading || !analytics}
            aria-label="Enviar pregunta a Gemini"
            className="w-8 h-8 rounded-full bg-gradient-to-r from-[#6D5DF6] to-[#5243E5] text-white flex items-center justify-center shrink-0 hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </aside>
  );
}
