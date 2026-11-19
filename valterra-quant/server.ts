import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface AssetSeriesPayload {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  previousClose: number;
  changePct: number;
  dates: string[];
  closes: number[];
  volumes: number[];
  source: 'Yahoo Finance' | 'Stooq';
}

interface CachedMarketEntry {
  expiresAt: number;
  data: AssetSeriesPayload;
}

interface CachedMacroEntry {
  expiresAt: number;
  riskFreeRate: number;
  benchmark: {
    symbol: string;
    name: string;
    price: number;
    changePct: number;
    vix: number | null;
  };
}

const assetCache = new Map<string, CachedMarketEntry>();
const geminiCache = new Map<string, { expiresAt: number; payload: unknown }>();
let macroCache: CachedMacroEntry | null = null;

function getCachedGemini(key: string): unknown | null {
  const hit = geminiCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    geminiCache.delete(key);
    return null;
  }
  return hit.payload;
}

function setCachedGemini(key: string, payload: unknown, ttlMs = 180_000) {
  if (geminiCache.size > 120) {
    const now = Date.now();
    for (const [k, v] of geminiCache.entries()) {
      if (v.expiresAt <= now) geminiCache.delete(k);
    }
  }
  geminiCache.set(key, { expiresAt: Date.now() + ttlMs, payload });
}

function parseGeminiJson<T = Record<string, unknown>>(rawText: string | undefined): T {
  const cleaned = (rawText || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) {
    throw new Error('Gemini devolvió una respuesta vacía.');
  }
  return JSON.parse(cleaned) as T;
}

async function generateGeminiContentFast(
  client: NonNullable<typeof ai>,
  params: {
    contents: string;
    config?: Record<string, unknown>;
  },
  timeoutMs = 11_000,
) {
  const invoke = (model: string) =>
    Promise.race([
      client.models.generateContent({
        model,
        contents: params.contents,
        config: {
          ...(params.config || {}),
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado al consultar Gemini.')), timeoutMs),
      ),
    ]);

  try {
    return await invoke('gemini-4-hydrogen');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
    const isAuthOrInvalid =
      msg.includes('API_KEY') || msg.includes('PERMISSION_DENIED') || msg.includes('400');

    if (isQuota) {
      return await invoke('gemini-3.1-flash-lite');
    }
    if (isAuthOrInvalid) {
      throw err;
    }
    await new Promise((r) => setTimeout(r, 300));
    return await invoke('gemini-4-hydrogen');
  }
}

function sanitizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9.\-^=]/g, '').slice(0, 16);
}

function sanitizeRange(raw: string): '3mo' | '6mo' | '1y' | '2y' {
  if (raw === '3mo' || raw === '6mo' || raw === '1y' || raw === '2y') {
    return raw;
  }
  return '1y';
}

async function fetchYahooChart(
  symbol: string,
  range: string,
): Promise<AssetSeriesPayload | null> {
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includeAdjustedClose=true`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includeAdjustedClose=true`,
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7500);
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) continue;

      const json = (await res.json()) as {
        chart?: {
          result?: Array<{
            meta?: {
              symbol?: string;
              shortName?: string;
              longName?: string;
              exchangeName?: string;
              fullExchangeName?: string;
              currency?: string;
              regularMarketPrice?: number;
              chartPreviousClose?: number;
              previousClose?: number;
            };
            timestamp?: number[];
            indicators?: {
              quote?: Array<{
                close?: Array<number | null>;
                volume?: Array<number | null>;
              }>;
              adjclose?: Array<{
                adjclose?: Array<number | null>;
              }>;
            };
          }>;
        };
      };

      const result = json.chart?.result?.[0];
      if (!result || !result.timestamp || result.timestamp.length < 15) {
        continue;
      }

      const timestamps = result.timestamp;
      const adjCloses = result.indicators?.adjclose?.[0]?.adjclose;
      const rawCloses = result.indicators?.quote?.[0]?.close;
      const rawVolumes = result.indicators?.quote?.[0]?.volume;

      const dates: string[] = [];
      const closes: number[] = [];
      const volumes: number[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const c = adjCloses?.[i] ?? rawCloses?.[i];
        if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
          const iso = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
          dates.push(iso);
          closes.push(Number(c.toFixed(4)));
          const v = rawVolumes?.[i];
          volumes.push(typeof v === 'number' && Number.isFinite(v) ? v : 0);
        }
      }

      if (closes.length < 15) continue;

      const meta = result.meta || {};
      const lastClose = closes[closes.length - 1];
      const prevClose =
        typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
          ? closes[closes.length - 2] ?? meta.chartPreviousClose
          : closes[closes.length - 2] ?? lastClose;
      const currentPrice =
        typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0
          ? meta.regularMarketPrice
          : lastClose;
      const changePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

      return {
        symbol: meta.symbol || symbol,
        name: meta.shortName || meta.longName || symbol,
        exchange: meta.fullExchangeName || meta.exchangeName || 'NYSE/NASDAQ',
        currency: meta.currency || 'USD',
        price: Number(currentPrice.toFixed(2)),
        previousClose: Number(prevClose.toFixed(2)),
        changePct: Number(changePct.toFixed(2)),
        dates,
        closes,
        volumes,
        source: 'Yahoo Finance',
      };
    } catch {
      // Try next endpoint
    }
  }
  return null;
}

async function fetchStooqFallback(symbol: string): Promise<AssetSeriesPayload | null> {
  try {
    const clean = symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean) return null;
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(clean)}.us&i=d`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 25) return null;

    const recent = lines.slice(1).slice(-252);
    const dates: string[] = [];
    const closes: number[] = [];
    const volumes: number[] = [];

    for (const line of recent) {
      const parts = line.split(',');
      if (parts.length < 5) continue;
      const d = parts[0]?.trim();
      const close = Number(parts[4]);
      const vol = Number(parts[5] || 0);
      if (d && Number.isFinite(close) && close > 0) {
        dates.push(d);
        closes.push(Number(close.toFixed(4)));
        volumes.push(Number.isFinite(vol) ? vol : 0);
      }
    }

    if (closes.length < 15) return null;
    const price = closes[closes.length - 1];
    const prev = closes[closes.length - 2] ?? price;
    const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;

    return {
      symbol,
      name: symbol,
      exchange: 'US Equity',
      currency: 'USD',
      price: Number(price.toFixed(2)),
      previousClose: Number(prev.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      dates,
      closes,
      volumes,
      source: 'Stooq',
    };
  } catch {
    return null;
  }
}

async function getAssetData(symbol: string, range: string): Promise<AssetSeriesPayload | null> {
  const key = `${symbol}:${range}`;
  const cached = assetCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let data = await fetchYahooChart(symbol, range);
  if (!data) {
    data = await fetchStooqFallback(symbol);
  }

  if (data) {
    assetCache.set(key, {
      expiresAt: Date.now() + 60_000,
      data,
    });
  }

  return data;
}

async function getMacroIndicators() {
  if (macroCache && macroCache.expiresAt > Date.now()) {
    return macroCache;
  }

  const [tnx, sp500, vix] = await Promise.all([
    fetchYahooChart('^TNX', '1mo'),
    fetchYahooChart('^GSPC', '1mo'),
    fetchYahooChart('^VIX', '1mo'),
  ]);

  const riskFreeRate =
    tnx && tnx.price > 0 && tnx.price < 25 ? Number((tnx.price / 100).toFixed(4)) : 0.0425;

  const entry: CachedMacroEntry = {
    expiresAt: Date.now() + 120_000,
    riskFreeRate,
    benchmark: {
      symbol: '^GSPC',
      name: 'S&P 500 Index',
      price: sp500?.price ?? 0,
      changePct: sp500?.changePct ?? 0,
      vix: vix?.price ?? null,
    },
  };

  macroCache = entry;
  return entry;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'portfoliomix-ai-gateway' });
  });

  app.get('/api/market/portfolio-data', async (req, res) => {
    try {
      const rawSymbols = String(req.query.symbols || 'AAPL,MSFT,NVDA,AVGO,GOOGL');
      const range = sanitizeRange(String(req.query.range || '1y'));

      const symbols = Array.from(
        new Set(
          rawSymbols
            .split(',')
            .map(sanitizeSymbol)
            .filter((s) => s.length >= 1),
        ),
      ).slice(0, 12);

      if (symbols.length < 2) {
        res.status(400).json({
          error: 'Se requieren al menos 2 símbolos bursátiles válidos para el cálculo de cartera.',
        });
        return;
      }

      const [assetResults, macro] = await Promise.all([
        Promise.all(symbols.map((sym) => getAssetData(sym, range))),
        getMacroIndicators(),
      ]);

      const assets = assetResults.filter((item): item is AssetSeriesPayload => item !== null);

      if (assets.length < 2) {
        res.status(502).json({
          error:
            'No se pudieron obtener series históricas suficientes desde Yahoo Finance o Stooq para los símbolos seleccionados.',
        });
        return;
      }

      const sources = Array.from(new Set(assets.map((a) => a.source)));
      if (macro.benchmark.price > 0 && !sources.includes('Yahoo Finance')) {
        sources.push('Yahoo Finance');
      }

      res.json({
        assets,
        riskFreeRate: macro.riskFreeRate,
        benchmark: macro.benchmark,
        fetchedAt: new Date().toISOString(),
        sources,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error interno consultando datos de mercado';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/market/search', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 1 || q.length > 40) {
        res.json({ quotes: [] });
        return;
      }

      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        res.status(502).json({ quotes: [], error: 'Error consultando búsqueda en Yahoo Finance.' });
        return;
      }

      const data = (await response.json()) as {
        quotes?: Array<{
          symbol?: string;
          shortname?: string;
          longname?: string;
          exchange?: string;
          quoteType?: string;
        }>;
      };

      const quotes = (data.quotes || [])
        .filter((item) => item.symbol && (item.quoteType === 'EQUITY' || item.quoteType === 'ETF'))
        .slice(0, 8)
        .map((item) => ({
          symbol: item.symbol || '',
          shortname: item.shortname || item.longname || item.symbol || '',
          exchange: item.exchange || 'MARKET',
          quoteType: item.quoteType || 'EQUITY',
        }));

      res.json({ quotes });
    } catch {
      res.json({ quotes: [] });
    }
  });

  app.post('/api/gemini/advisor', async (req, res) => {
    try {
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY no está configurada en el entorno del servidor.',
        });
        return;
      }

      const body = req.body as {
        mode?: 'summary' | 'chat' | 'chart';
        chartType?: 'random_forest' | 'knn';
        question?: string;
        portfolioContext?: {
          userName?: string;
          portfolioName?: string;
          portfolioValue?: number;
          expectedReturnPct?: number;
          volatilityPct?: number;
          sharpeRatio?: number;
          rfPortfolioSharpe?: number;
          oobR2Score?: number;
          treeCount?: number;
          weightedVariancePct?: number;
          avgPearson?: number;
          riskFreeRatePct?: number;
          riskPreference?: string;
          objective?: string;
          featureImportances?: Array<{
            label: string;
            importancePct: number;
          }>;
          assets?: Array<{
            symbol: string;
            name: string;
            weightPct: number;
            rfWeightPct?: number;
            expectedReturnPct: number;
            rfPredictedReturnPct?: number;
            volatilityPct: number;
            sharpe: number;
            beta?: number;
            maxDrawdownPct?: number;
            price: number;
          }>;
        };
      };

      const ctx = body.portfolioContext || {};
      const assetsList = ctx.assets || [];
      const assetsText = assetsList
        .map(
          (a) =>
            `${a.symbol} (${a.name}): peso actual ${a.weightPct.toFixed(1)}%, peso RF ${(a.rfWeightPct ?? a.weightPct).toFixed(1)}%, precio $${a.price.toFixed(2)}, retorno esperado ${a.expectedReturnPct.toFixed(1)}%, retorno predicho RF ${(a.rfPredictedReturnPct ?? a.expectedReturnPct).toFixed(1)}%, volatilidad ${a.volatilityPct.toFixed(1)}%, Sharpe ${a.sharpe.toFixed(2)}, beta ${(a.beta ?? 1).toFixed(2)}, maxDrawdown ${(a.maxDrawdownPct ?? 0).toFixed(1)}%`,
        )
        .join('\n');

      const importancesText = (ctx.featureImportances || [])
        .map((fi) => `${fi.label}: ${fi.importancePct.toFixed(1)}%`)
        .join(', ');

      const contextBlock = `Usuario: ${ctx.userName || 'Inversionista'}
Portafolio: ${ctx.portfolioName || 'Mix Principal'}
Valor invertido: $${Number(ctx.portfolioValue || 0).toLocaleString('en-US')}
Rendimiento esperado anual: ${(ctx.expectedReturnPct ?? 0).toFixed(2)}%
Volatilidad (Desviación estándar anual): ${(ctx.volatilityPct ?? 0).toFixed(2)}%
Varianza ponderada: ${(ctx.weightedVariancePct ?? 0).toFixed(2)}%²
Sharpe Ratio actual: ${(ctx.sharpeRatio ?? 0).toFixed(2)} (Rf=${(ctx.riskFreeRatePct ?? 4.25).toFixed(2)}%)
Sharpe Ratio Random Forest: ${(ctx.rfPortfolioSharpe ?? ctx.sharpeRatio ?? 0).toFixed(2)} (Árboles: ${ctx.treeCount ?? 40}, OOB R²: ${(ctx.oobR2Score ?? 0).toFixed(3)})
Correlación media de Pearson: ${(ctx.avgPearson ?? 0).toFixed(3)}
Importancia de variables RF: ${importancesText || 'N/D'}
Preferencia de riesgo: ${ctx.riskPreference || 'Moderado'}
Objetivo de optimización: ${ctx.objective || 'Max Sharpe'}
Activos reales:
${assetsText}`;

      if (body.mode === 'chat') {
        const question = String(body.question || '').trim().slice(0, 800);
        if (!question) {
          res.status(400).json({ error: 'La consulta está vacía.' });
          return;
        }

        const response = await generateGeminiContentFast(ai, {
          contents: `Contexto real del portafolio del usuario:\n${contextBlock}\n\nPregunta del usuario:\n${question}`,
          config: {
            systemInstruction:
              'Eres Gemini, asesor financiero cuantitativo de PortfolioMix AI. Responde en español de forma clara, concisa y accionable (máximo 120 palabras), citando exclusivamente los tickers y cifras reales del contexto entregado.',
          },
        });

        res.json({ answer: (response.text || '').trim() });
        return;
      }

      if (body.mode === 'chart') {
        if (assetsList.length < 2) {
          res.status(400).json({
            error: 'Se necesitan al menos 2 activos reales para generar un gráfico.',
          });
          return;
        }

        const chartKey = `${body.chartType || 'random_forest'}:${assetsList
          .map(
            (a) =>
              `${a.symbol}=${(a.rfWeightPct ?? a.weightPct).toFixed(1)}:${a.expectedReturnPct.toFixed(1)}:${a.volatilityPct.toFixed(1)}`,
          )
          .join('|')}`;
        const cachedChart = getCachedGemini(`chart:${chartKey}`);
        if (cachedChart) {
          res.json(cachedChart);
          return;
        }

        if (body.chartType === 'knn') {
          // Compute exact standardized Euclidean K-Nearest Neighbors across assets
          const kVal = Math.min(2, assetsList.length - 1);
          const features = assetsList.map((a) => [
            a.expectedReturnPct,
            a.volatilityPct,
            a.sharpe * 10,
            (a.beta ?? 1) * 10,
          ]);
          const dim = features[0].length;
          const means = Array.from({ length: dim }, (_, d) =>
            features.reduce((s, f) => s + f[d], 0) / features.length,
          );
          const stds = Array.from({ length: dim }, (_, d) => {
            const v =
              features.reduce((s, f) => s + (f[d] - means[d]) ** 2, 0) /
              Math.max(1, features.length);
            return Math.sqrt(v) || 1;
          });
          const zFeatures = features.map((f) => f.map((val, d) => (val - means[d]) / stds[d]));

          const knnComputed = assetsList.map((a, i) => {
            const dists = assetsList
              .map((b, j) => {
                if (i === j) return null;
                const dist = Math.sqrt(
                  zFeatures[i].reduce((s, v, d) => s + (v - zFeatures[j][d]) ** 2, 0),
                );
                return { symbol: b.symbol, dist: Number(dist.toFixed(3)) };
              })
              .filter((x): x is { symbol: string; dist: number } => x !== null)
              .sort((x, y) => x.dist - y.dist);
            const topNeighbors = dists.slice(0, kVal);
            const avgDist =
              topNeighbors.reduce((s, n) => s + n.dist, 0) / Math.max(1, topNeighbors.length);
            return {
              ticker: a.symbol,
              volatilityPct: Number(a.volatilityPct.toFixed(2)),
              expectedReturnPct: Number(a.expectedReturnPct.toFixed(2)),
              sharpe: Number(a.sharpe.toFixed(2)),
              nearestNeighbors: topNeighbors.map((n) => n.symbol),
              neighborDistance: Number(avgDist.toFixed(3)),
            };
          });

          const knnSummaryLines = knnComputed.map(
            (item) =>
              `${item.ticker}: μ=${item.expectedReturnPct}%, σ=${item.volatilityPct}%, Sharpe=${item.sharpe}, vecinos=[${item.nearestNeighbors.join(', ')}], d=${item.neighborDistance}`,
          );

          const response = await generateGeminiContentFast(ai, {
            contents: `Clasifica estos activos reales en 2 o 3 clusters KNN (K=${kVal}) para el portafolio "${ctx.portfolioName || 'Mix'}":\n${knnSummaryLines.join('\n')}`,
            config: {
              systemInstruction:
                'Eres Gemini en PortfolioMix AI. Responde en JSON breve en español clasificando todos los tickers entregados en 2 o 3 clusters (clusterIndex 0, 1 o 2) según su perfil riesgo-retorno y vecinos cercanos.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  chartTitle: { type: Type.STRING },
                  chartSubtitle: { type: Type.STRING },
                  insight: { type: Type.STRING },
                  clusters: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        clusterIndex: { type: Type.INTEGER },
                        clusterName: { type: Type.STRING },
                        summary: { type: Type.STRING },
                      },
                      required: ['clusterIndex', 'clusterName', 'summary'],
                    },
                  },
                  pointClusters: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        ticker: { type: Type.STRING },
                        clusterIndex: { type: Type.INTEGER },
                        clusterLabel: { type: Type.STRING },
                      },
                      required: ['ticker', 'clusterIndex', 'clusterLabel'],
                    },
                  },
                },
                required: ['chartTitle', 'chartSubtitle', 'insight', 'clusters', 'pointClusters'],
              },
            },
          });

          const parsed = parseGeminiJson<{
            chartTitle?: string;
            chartSubtitle?: string;
            insight?: string;
            clusters?: Array<{ clusterIndex: number; clusterName: string; summary: string }>;
            pointClusters?: Array<{ ticker: string; clusterIndex: number; clusterLabel: string }>;
          }>(response.text);

          const clusterByTicker = new Map(
            (parsed.pointClusters || []).map((pc) => [pc.ticker.toUpperCase(), pc]),
          );
          const clusters =
            parsed.clusters && parsed.clusters.length > 0
              ? parsed.clusters
              : [
                  { clusterIndex: 0, clusterName: 'Núcleo Defensivo', summary: 'Menor volatilidad relativa' },
                  { clusterIndex: 1, clusterName: 'Crecimiento / Alfa', summary: 'Mayor retorno esperado y dispersión' },
                ];

          const points = knnComputed.map((item, idx) => {
            const assigned = clusterByTicker.get(item.ticker.toUpperCase());
            const clusterIdx =
              typeof assigned?.clusterIndex === 'number'
                ? Math.abs(assigned.clusterIndex) % Math.max(1, clusters.length)
                : idx % clusters.length;
            const clusterLabel =
              assigned?.clusterLabel ||
              clusters.find((c) => c.clusterIndex === clusterIdx)?.clusterName ||
              `Cluster ${clusterIdx + 1}`;
            return {
              ...item,
              clusterIndex: clusterIdx,
              clusterLabel,
            };
          });

          const payload = {
            chartType: 'knn',
            data: {
              chartTitle: parsed.chartTitle || `Agrupamiento KNN (K=${kVal}) de Activos`,
              chartSubtitle:
                parsed.chartSubtitle ||
                'Similitud riesgo-retorno en espacio estandarizado de 4 dimensiones',
              kValue: kVal,
              xAxisLabel: 'Volatilidad Anual (%)',
              yAxisLabel: 'Rendimiento Esperado (%)',
              insight:
                parsed.insight ||
                'Los activos más próximos comparten sensibilidad riesgo-retorno y permiten sustituir exposición sin alterar el perfil del portafolio.',
              clusters,
              points,
            },
          };
          setCachedGemini(`chart:${chartKey}`, payload);
          res.json(payload);
          return;
        }

        // Default chartType === 'random_forest'
        const rfLines = assetsList.map(
          (a) =>
            `${a.symbol}: pesoRF=${(a.rfWeightPct ?? a.weightPct).toFixed(1)}%, retornoRF=${(a.rfPredictedReturnPct ?? a.expectedReturnPct).toFixed(1)}%, vol=${a.volatilityPct.toFixed(1)}%, Sharpe=${a.sharpe.toFixed(2)}`,
        );

        const response = await generateGeminiContentFast(ai, {
          contents: `Portafolio "${ctx.portfolioName || 'Mix'}" optimizado con Random Forest (Sharpe ${(ctx.rfPortfolioSharpe ?? ctx.sharpeRatio ?? 0).toFixed(2)}, variables: ${importancesText || 'N/D'}):\n${rfLines.join('\n')}`,
          config: {
            systemInstruction:
              'Eres Gemini en PortfolioMix AI. Responde en JSON breve en español interpretando la asignación Random Forest: define chartTitle, chartSubtitle, topDriverLabel (ej. "Sharpe / Momento"), insight (1-2 frases citando tickers reales) y pointTags con un roleTag de máximo 2 palabras por cada ticker.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                chartTitle: { type: Type.STRING },
                chartSubtitle: { type: Type.STRING },
                topDriverLabel: { type: Type.STRING },
                insight: { type: Type.STRING },
                pointTags: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      ticker: { type: Type.STRING },
                      roleTag: { type: Type.STRING },
                    },
                    required: ['ticker', 'roleTag'],
                  },
                },
              },
              required: ['chartTitle', 'chartSubtitle', 'topDriverLabel', 'insight', 'pointTags'],
            },
          },
        });

        const parsed = parseGeminiJson<{
          chartTitle?: string;
          chartSubtitle?: string;
          topDriverLabel?: string;
          insight?: string;
          pointTags?: Array<{ ticker: string; roleTag: string }>;
        }>(response.text);

        const tagMap = new Map(
          (parsed.pointTags || []).map((pt) => [pt.ticker.toUpperCase(), pt.roleTag]),
        );

        const points = assetsList.map((a) => ({
          ticker: a.symbol,
          rfWeightPct: Number((a.rfWeightPct ?? a.weightPct).toFixed(2)),
          rfPredictedReturnPct: Number((a.rfPredictedReturnPct ?? a.expectedReturnPct).toFixed(2)),
          volatilityPct: Number(a.volatilityPct.toFixed(2)),
          sharpe: Number(a.sharpe.toFixed(2)),
          roleTag:
            tagMap.get(a.symbol.toUpperCase()) ||
            (a.sharpe >= 0.7 ? 'Motor Sharpe' : a.volatilityPct <= 18 ? 'Ancla Estable' : 'Táctico'),
        }));

        const payload = {
          chartType: 'random_forest',
          data: {
            chartTitle: parsed.chartTitle || 'Asignación Óptima Random Forest vs. Retorno Predicho',
            chartSubtitle:
              parsed.chartSubtitle ||
              `Pesos sugeridos para maximizar Sharpe (${(ctx.rfPortfolioSharpe ?? ctx.sharpeRatio ?? 0).toFixed(2)})`,
            xAxisLabel: 'Activos del portafolio',
            yAxisLabel: 'Peso óptimo RF (%)',
            topDriverLabel: parsed.topDriverLabel || 'Sharpe Ajustado',
            insight:
              parsed.insight ||
              'Random Forest prioriza los activos con mejor relación retorno predicho / volatilidad histórica.',
            points,
          },
        };
        setCachedGemini(`chart:${chartKey}`, payload);
        res.json(payload);
        return;
      }

      // mode === 'summary'
      const summaryKey = `summary:${ctx.portfolioName || ''}:${assetsList
        .map((a) => `${a.symbol}=${a.weightPct.toFixed(1)}`)
        .join('|')}:${ctx.riskPreference || ''}:${ctx.objective || ''}`;
      const cachedSummary = getCachedGemini(summaryKey);
      if (cachedSummary) {
        res.json(cachedSummary);
        return;
      }

      const response = await generateGeminiContentFast(ai, {
        contents: `Analiza este portafolio real y genera un resumen estructurado en español:\n${contextBlock}`,
        config: {
          systemInstruction:
            'Eres Gemini, asesor financiero cuantitativo de PortfolioMix AI. Basa cada punto estrictamente en las métricas reales recibidas (tickers, pesos, volatilidad, Sharpe y correlación de Pearson). Mantén los textos breves, profesionales y en español.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysisSummary: {
                type: Type.STRING,
                description: 'Resumen breve (2 frases) de rendimiento, volatilidad y Sharpe.',
              },
              strengths: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 fortalezas concretas del portafolio actual.',
              },
              risks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '1 o 2 riesgos reales basados en concentración o volatilidad.',
              },
              suggestion: {
                type: Type.STRING,
                description: '1 sugerencia práctica de balanceo citando tickers reales.',
              },
            },
            required: ['analysisSummary', 'strengths', 'risks', 'suggestion'],
          },
        },
      });

      const parsed = parseGeminiJson(response.text);
      setCachedGemini(summaryKey, parsed);
      res.json(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error consultando Gemini AI';
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Se alcanzó el límite temporal o diario de solicitudes de Gemini API. Revisa tu cuota/plan en Settings > Secrets o inténtalo más tarde.',
        });
        return;
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
        res.status(403).json({
          error:
            'La clave de Gemini API no es válida o no tiene permisos. Verifica GEMINI_API_KEY en Settings > Secrets.',
        });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PortfolioMix AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
