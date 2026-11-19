import type {
  AssetHorizonProjection,
  AssetRiskMetrics,
  FrontierPoint,
  HorizonSummaryCard,
  MarkowitzFrontierResult,
  MarketAssetSeries,
  OptimizationObjective,
  PearsonMatrix,
  PortfolioAnalyticsResult,
  PortfolioPredictionResult,
  PredictionConfidenceLevel,
  PredictionHorizonId,
  PredictionReturnModel,
  PredictionStepPoint,
  RiskPreference,
  SectorId,
  StressScenario,
  StressTestOutput,
} from '../types/quant';
import { runRandomForestOptimization } from './randomForest';

interface AlignedSeries {
  dates: string[];
  returnsByAsset: number[][];
}

function alignAssetReturns(assets: MarketAssetSeries[]): AlignedSeries {
  if (assets.length === 0) return { dates: [], returnsByAsset: [] };

  const priceMaps = assets.map((asset) => {
    const map = new Map<string, number>();
    for (let i = 0; i < asset.dates.length; i++) {
      map.set(asset.dates[i], asset.closes[i]);
    }
    return map;
  });

  const commonDates = assets[0].dates.filter((d) =>
    priceMaps.every((m) => m.has(d)),
  );

  // Fallback if exchanges had slight holiday mismatch: align by tail length
  if (commonDates.length < 20) {
    const minLen = Math.min(...assets.map((a) => a.closes.length));
    const tailDates = assets[0].dates.slice(-minLen).slice(1);
    const returnsByAsset = assets.map((asset) => {
      const slice = asset.closes.slice(-minLen);
      const rets: number[] = [];
      for (let i = 1; i < slice.length; i++) {
        rets.push((slice[i] - slice[i - 1]) / slice[i - 1]);
      }
      return rets;
    });
    return { dates: tailDates, returnsByAsset };
  }

  const returnsByAsset = assets.map((_, assetIdx) => {
    const map = priceMaps[assetIdx];
    const rets: number[] = [];
    for (let i = 1; i < commonDates.length; i++) {
      const prev = map.get(commonDates[i - 1])!;
      const curr = map.get(commonDates[i])!;
      rets.push((curr - prev) / prev);
    }
    return rets;
  });

  return {
    dates: commonDates.slice(1),
    returnsByAsset,
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

export function computePearsonAndCovariance(
  symbols: string[],
  returnsByAsset: number[][],
): PearsonMatrix {
  const n = returnsByAsset.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const covarianceMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const means = returnsByAsset.map(mean);

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const rI = returnsByAsset[i];
      const rJ = returnsByAsset[j];
      const len = Math.min(rI.length, rJ.length);
      if (len < 2) {
        matrix[i][j] = i === j ? 1 : 0;
        matrix[j][i] = matrix[i][j];
        continue;
      }

      let covSum = 0;
      let varISum = 0;
      let varJSum = 0;
      for (let t = 0; t < len; t++) {
        const di = rI[t] - means[i];
        const dj = rJ[t] - means[j];
        covSum += di * dj;
        varISum += di * di;
        varJSum += dj * dj;
      }

      const covAnnual = (covSum / (len - 1)) * 252;
      const denom = Math.sqrt(varISum * varJSum);
      const pearson = denom > 1e-12 ? Math.max(-1, Math.min(1, covSum / denom)) : i === j ? 1 : 0;

      matrix[i][j] = pearson;
      matrix[j][i] = pearson;
      covarianceMatrix[i][j] = covAnnual;
      covarianceMatrix[j][i] = covAnnual;
    }
  }

  let pairSum = 0;
  let pairCount = 0;
  let minPair = { a: symbols[0] || '', b: symbols[1] || symbols[0] || '', value: 1 };
  let maxPair = { a: symbols[0] || '', b: symbols[1] || symbols[0] || '', value: -1 };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const val = matrix[i][j];
      pairSum += val;
      pairCount++;
      if (val < minPair.value) {
        minPair = { a: symbols[i], b: symbols[j], value: val };
      }
      if (val > maxPair.value) {
        maxPair = { a: symbols[i], b: symbols[j], value: val };
      }
    }
  }

  return {
    symbols,
    matrix,
    covarianceMatrix,
    avgPairwiseCorrelation: pairCount > 0 ? pairSum / pairCount : 0,
    minCorrelationPair: minPair,
    maxCorrelationPair: maxPair,
  };
}

function portfolioStats(
  weights: number[],
  expectedReturns: number[],
  covarianceMatrix: number[][],
  riskFreeRate: number,
) {
  const n = weights.length;
  let expReturn = 0;
  let weightedVar = 0;
  let naiveVar = 0;

  for (let i = 0; i < n; i++) {
    expReturn += weights[i] * expectedReturns[i];
    naiveVar += weights[i] * weights[i] * covarianceMatrix[i][i];
    for (let j = 0; j < n; j++) {
      weightedVar += weights[i] * weights[j] * covarianceMatrix[i][j];
    }
  }

  weightedVar = Math.max(0, weightedVar);
  const stdDev = Math.sqrt(weightedVar);
  const sharpe = stdDev > 1e-6 ? (expReturn - riskFreeRate) / stdDev : 0;

  return { expReturn, weightedVar, naiveVar, stdDev, sharpe };
}

function buildEquityCurve(returnsByAsset: number[][], weights: number[]): number[] {
  const days = returnsByAsset[0]?.length || 0;
  const curve: number[] = [100];
  let equity = 100;
  for (let t = 0; t < days; t++) {
    let portRet = 0;
    for (let i = 0; i < weights.length; i++) {
      portRet += weights[i] * returnsByAsset[i][t];
    }
    equity *= 1 + portRet;
    curve.push(Number(equity.toFixed(2)));
  }
  return curve;
}

function maxDrawdown(returns: number[]): number {
  let eq = 1;
  let peak = 1;
  let worst = 0;
  for (const r of returns) {
    eq *= 1 + r;
    if (eq > peak) peak = eq;
    const dd = (eq - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst;
}

export function analyzePortfolio(
  marketAssets: MarketAssetSeries[],
  riskFreeRate: number,
  customWeights?: number[] | null,
): PortfolioAnalyticsResult {
  const { dates, returnsByAsset } = alignAssetReturns(marketAssets);
  const symbols = marketAssets.map((a) => a.symbol);
  const n = marketAssets.length;
  const pearson = computePearsonAndCovariance(symbols, returnsByAsset);
  const rfResult = runRandomForestOptimization(returnsByAsset, riskFreeRate);

  const eqWeights = Array(n).fill(1 / n);
  const activeWeights =
    customWeights && customWeights.length === n
      ? (() => {
          const sum = customWeights.reduce((a, b) => a + Math.max(0, b), 0);
          return sum > 0 ? customWeights.map((w) => Math.max(0, w) / sum) : rfResult.optimalWeights;
        })()
      : rfResult.optimalWeights;

  const expectedReturns = returnsByAsset.map((r) => mean(r) * 252);

  // Market equal-weight basket returns for Beta calculation
  const days = returnsByAsset[0]?.length || 0;
  const basketReturns: number[] = [];
  for (let t = 0; t < days; t++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += returnsByAsset[i][t];
    basketReturns.push(s / n);
  }
  const basketMean = mean(basketReturns);

  const activeStats = portfolioStats(
    activeWeights,
    expectedReturns,
    pearson.covarianceMatrix,
    riskFreeRate,
  );
  const rfStats = portfolioStats(
    rfResult.optimalWeights,
    expectedReturns,
    pearson.covarianceMatrix,
    riskFreeRate,
  );
  const eqStats = portfolioStats(
    eqWeights,
    expectedReturns,
    pearson.covarianceMatrix,
    riskFreeRate,
  );

  // Individual variance & marginal risk contribution
  const rawAssets: AssetRiskMetrics[] = marketAssets.map((asset, i) => {
    const indVar = Math.max(0, pearson.covarianceMatrix[i][i]);
    const indStd = Math.sqrt(indVar);
    const expRet = expectedReturns[i];
    const sharpe = indStd > 1e-6 ? (expRet - riskFreeRate) / indStd : 0;

    // Marginal Risk Contribution = (Cov * w)_i / sigma_p
    let covWeightSum = 0;
    for (let j = 0; j < n; j++) {
      covWeightSum += pearson.covarianceMatrix[i][j] * activeWeights[j];
    }
    const mcr = activeStats.stdDev > 1e-6 ? covWeightSum / activeStats.stdDev : 0;
    const compRisk = activeWeights[i] * mcr;
    const compRiskPct = activeStats.stdDev > 1e-6 ? (compRisk / activeStats.stdDev) * 100 : 0;

    // Beta vs Equal-Weight Basket
    let covB = 0;
    let varB = 0;
    const aMean = mean(returnsByAsset[i]);
    for (let t = 0; t < days; t++) {
      const da = returnsByAsset[i][t] - aMean;
      const db = basketReturns[t] - basketMean;
      covB += da * db;
      varB += db * db;
    }
    const beta = varB > 1e-12 ? covB / varB : 1;

    return {
      symbol: asset.symbol,
      name: asset.name,
      price: asset.price,
      changePct: asset.changePct,
      source: asset.source,
      weight: activeWeights[i],
      rfWeight: rfResult.optimalWeights[i],
      equalWeight: eqWeights[i],
      expectedReturn: expRet,
      individualVariance: indVar,
      standardDeviation: indStd,
      sharpeRatio: sharpe,
      rfPredictedReturn: rfResult.predictedReturns[i],
      rfPredictedRisk: rfResult.predictedRisks[i],
      marginalRiskContribution: mcr,
      componentRiskPct: compRiskPct,
      beta,
      maxDrawdown: maxDrawdown(returnsByAsset[i]),
      volatilityRank: 1,
    };
  });

  // Compute volatility ranking (Sorteo de Volatilidad: 1 = mayor volatilidad)
  const sortedIndices = rawAssets
    .map((a, idx) => ({ std: a.standardDeviation, idx }))
    .sort((a, b) => b.std - a.std);
  sortedIndices.forEach((entry, rankIdx) => {
    rawAssets[entry.idx].volatilityRank = rankIdx + 1;
  });

  const sumIndWeightedAvgVar = rawAssets.reduce(
    (acc, a) => acc + a.weight * a.individualVariance,
    0,
  );
  const diversificationBenefitPct =
    sumIndWeightedAvgVar > 1e-9
      ? Math.max(0, ((sumIndWeightedAvgVar - activeStats.weightedVar) / sumIndWeightedAvgVar) * 100)
      : 0;

  return {
    assets: rawAssets,
    pearson,
    portfolioExpectedReturn: activeStats.expReturn,
    weightedVariance: activeStats.weightedVar,
    naiveSumVariance: activeStats.naiveVar,
    diversificationBenefitPct,
    standardDeviation: activeStats.stdDev,
    sharpeRatio: activeStats.sharpe,
    riskFreeRate,
    rfPortfolioReturn: rfStats.expReturn,
    rfPortfolioVolatility: rfStats.stdDev,
    rfPortfolioSharpe: rfStats.sharpe,
    equalWeightSharpe: eqStats.sharpe,
    featureImportances: rfResult.featureImportances,
    oobR2Score: rfResult.oobR2Score,
    treeCount: rfResult.treeCount,
    dates: ['Inicio', ...dates],
    equityCurveOptimal: buildEquityCurve(returnsByAsset, rfResult.optimalWeights),
    equityCurveEqual: buildEquityCurve(returnsByAsset, eqWeights),
    equityCurveCurrent: buildEquityCurve(returnsByAsset, activeWeights),
  };
}

const Z_95 = 1.6448536269514722;
const PDF_Z_95 = Math.exp(-0.5 * Z_95 * Z_95) / Math.sqrt(2 * Math.PI); // ~0.10313564
const PDF_Z_99 = 0.02665214; // standard normal density at z_99 = 2.326348

export function computeParametricVarCvar95(
  expectedReturn: number,
  volatility: number,
): { var95: number; cvar95: number } {
  const sigma = Math.max(0, volatility);
  const var95 = Math.max(0, Z_95 * sigma - expectedReturn);
  const cvar95 = Math.max(var95, (PDF_Z_95 / 0.05) * sigma - expectedReturn);
  return { var95, cvar95 };
}

export function buildReportFingerprint(rawInput: string): string {
  // Deterministic 64-bit FNV-1a-like dual hash yielding an alphanumeric ID safe for Firestore rules
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < rawInput.length; i++) {
    const ch = rawInput.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(36);
  const part2 = (h2 >>> 0).toString(36);
  return `rep_${part1}_${part2}`;
}

export function runStressTest(
  analytics: PortfolioAnalyticsResult,
  sectorId: SectorId,
  scenario: StressScenario,
): StressTestOutput {
  const n = analytics.assets.length;
  const sectorAdj = (scenario.sectorAdjustments[sectorId] ?? 0) / 100;
  const shockDecimal = scenario.marketShockPct / 100;
  const stressedRf = Math.max(0, analytics.riskFreeRate + scenario.rateShiftBps / 10000);

  // Build stressed covariance matrix: Sigma_stress = VolMult^2 * ((1 - alpha)*Corr + alpha*CorrTarget) * sigma_i * sigma_j
  const corrBlend = 0.65;
  const stressedCov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const stressedVols: number[] = [];

  for (let i = 0; i < n; i++) {
    const sVol = analytics.assets[i].standardDeviation * scenario.volMultiplier;
    stressedVols.push(sVol);
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const baseCorr = analytics.pearson.matrix[i][j];
      const stressedCorr =
        i === j
          ? 1
          : baseCorr + corrBlend * (scenario.correlationTarget - baseCorr);
      stressedCov[i][j] = stressedCorr * stressedVols[i] * stressedVols[j];
    }
  }

  let stressedWeightedVariance = 0;
  let stressedReturn = 0;

  const assetImpacts = analytics.assets.map((asset, i) => {
    const w = asset.weight;
    const assetShock = shockDecimal * asset.beta + sectorAdj;
    const projectedAssetReturn = asset.expectedReturn + assetShock;
    stressedReturn += w * projectedAssetReturn;

    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      const contrib = w * analytics.assets[j].weight * stressedCov[i][j];
      stressedWeightedVariance += contrib;
      rowSum += analytics.assets[j].weight * stressedCov[i][j];
    }

    return {
      symbol: asset.symbol,
      name: asset.name,
      weight: w,
      baselineVol: asset.standardDeviation,
      stressedVol: stressedVols[i],
      projectedLossPct: assetShock * 100,
      rawCovContrib: w * rowSum,
    };
  });

  stressedWeightedVariance = Math.max(0, stressedWeightedVariance);
  const stressedVolatility = Math.sqrt(stressedWeightedVariance);
  const stressedSharpe =
    stressedVolatility > 1e-6 ? (stressedReturn - stressedRf) / stressedVolatility : 0;

  // Parametric Annualized VaR 95% and CVaR 95% (Expected Shortfall under normality)
  const { var95, cvar95 } = computeParametricVarCvar95(stressedReturn, stressedVolatility);
  const cvar99 = Math.max(var95, (PDF_Z_99 / 0.01) * stressedVolatility - stressedReturn);
  const estimatedDrawdownPct = Math.min(
    -1,
    (shockDecimal + sectorAdj) * 100 - stressedVolatility * 35,
  );
  const drawdownMethodology =
    'Aproximación paramétrica anual: min(-1%, choque_mercado + ajuste_sectorial − 0.35 × volatilidad_estresada).';

  return {
    scenarioName: scenario.name,
    baselineReturn: analytics.portfolioExpectedReturn,
    stressedReturn,
    baselineVolatility: analytics.standardDeviation,
    stressedVolatility,
    stressedWeightedVariance,
    baselineSharpe: analytics.sharpeRatio,
    stressedSharpe,
    var95,
    cvar95,
    cvar99,
    estimatedDrawdownPct,
    drawdownMethodology,
    assetImpacts: assetImpacts.map((item) => ({
      symbol: item.symbol,
      name: item.name,
      weight: item.weight,
      baselineVol: item.baselineVol,
      stressedVol: item.stressedVol,
      projectedLossPct: item.projectedLossPct,
      riskContributionPct:
        stressedWeightedVariance > 1e-9
          ? (item.rawCovContrib / stressedWeightedVariance) * 100
          : 0,
    })),
  };
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function computeMarkowitzFrontier(
  analytics: PortfolioAnalyticsResult,
): MarkowitzFrontierResult {
  const n = analytics.assets.length;
  const mu = analytics.assets.map((a) => a.expectedReturn);
  const cov = analytics.pearson.covarianceMatrix;
  const rf = analytics.riskFreeRate;
  const rng = seededRandom(90210 + n * 17);

  const evalPoint = (w: number[]): FrontierPoint => {
    const st = portfolioStats(w, mu, cov, rf);
    return {
      risk: st.stdDev,
      expectedReturn: st.expReturn,
      sharpe: st.sharpe,
      weights: w,
    };
  };

  // Start candidates with analytical edge cases + Monte Carlo sampling
  const candidates: FrontierPoint[] = [];

  // Equal weight
  candidates.push(evalPoint(Array(n).fill(1 / n)));
  // Random Forest weights
  candidates.push(evalPoint(analytics.assets.map((a) => a.rfWeight)));
  // Inverse volatility
  const invVols = analytics.assets.map((a) =>
    a.standardDeviation > 1e-6 ? 1 / a.standardDeviation : 1,
  );
  const invSum = invVols.reduce((a, b) => a + b, 0);
  candidates.push(evalPoint(invVols.map((v) => v / invSum)));

  // Concentrated corners & pairs
  for (let i = 0; i < n; i++) {
    const w = Array(n).fill(0);
    w[i] = 1;
    candidates.push(evalPoint(w));
  }

  // 1,200 Dirichlet-sampled portfolios on the simplex
  for (let s = 0; s < 1200; s++) {
    const raw: number[] = [];
    const concentration = s % 3 === 0 ? 0.35 : s % 3 === 1 ? 1.0 : 2.2;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const u = Math.max(1e-6, rng());
      const val = Math.pow(-Math.log(u), 1 / concentration);
      raw.push(val);
      sum += val;
    }
    candidates.push(evalPoint(raw.map((v) => v / sum)));
  }

  // Hill-climbing refinement for Global Minimum Variance
  let minRiskPoint = candidates.reduce((best, p) => (p.risk < best.risk ? p : best), candidates[0]);
  {
    let w = [...minRiskPoint.weights];
    for (let iter = 0; iter < 120; iter++) {
      const step = 0.04 * (1 - iter / 140);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j || w[j] < step) continue;
          const next = [...w];
          next[i] += step;
          next[j] -= step;
          const p = evalPoint(next);
          if (p.risk < minRiskPoint.risk) {
            minRiskPoint = p;
            w = next;
          }
        }
      }
    }
  }

  // Hill-climbing refinement for Max Sharpe Tangency Portfolio
  let maxSharpePoint = candidates.reduce(
    (best, p) => (p.sharpe > best.sharpe ? p : best),
    candidates[0],
  );
  {
    let w = [...maxSharpePoint.weights];
    for (let iter = 0; iter < 120; iter++) {
      const step = 0.04 * (1 - iter / 140);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j || w[j] < step) continue;
          const next = [...w];
          next[i] += step;
          next[j] -= step;
          const p = evalPoint(next);
          if (p.sharpe > maxSharpePoint.sharpe) {
            maxSharpePoint = p;
            w = next;
          }
        }
      }
    }
  }

  // Trace upper Efficient Frontier envelope from minRiskPoint upward
  const allPts = [...candidates, minRiskPoint, maxSharpePoint];
  const minRet = minRiskPoint.expectedReturn;
  const maxRet = Math.max(...allPts.map((p) => p.expectedReturn));
  const buckets = 26;
  const frontierCurve: Array<{ risk: number; expectedReturn: number; sharpe: number }> = [];

  for (let b = 0; b <= buckets; b++) {
    const targetRet = minRet + ((maxRet - minRet) * b) / buckets;
    const eligible = allPts.filter((p) => p.expectedReturn >= targetRet - 1e-4);
    if (eligible.length === 0) continue;
    const best = eligible.reduce((acc, p) => (p.risk < acc.risk ? p : acc), eligible[0]);
    if (
      frontierCurve.length === 0 ||
      (best.risk >= frontierCurve[frontierCurve.length - 1].risk - 0.002 &&
        best.expectedReturn >= frontierCurve[frontierCurve.length - 1].expectedReturn)
    ) {
      frontierCurve.push({
        risk: best.risk,
        expectedReturn: best.expectedReturn,
        sharpe: best.sharpe,
      });
    }
  }

  const currentPoint = evalPoint(analytics.assets.map((a) => a.weight));

  return {
    cloud: candidates.slice(0, 750).map((p) => ({
      risk: p.risk,
      expectedReturn: p.expectedReturn,
      sharpe: p.sharpe,
    })),
    frontierCurve,
    minRiskPoint,
    maxSharpePoint,
    currentPoint,
  };
}

export function solveObjectiveWeights(
  analytics: PortfolioAnalyticsResult,
  riskPreference: RiskPreference,
  objective: OptimizationObjective,
): number[] {
  const frontier = computeMarkowitzFrontier(analytics);
  const minW = frontier.minRiskPoint.weights;
  const maxSharpeW = frontier.maxSharpePoint.weights;
  const rfW = analytics.assets.map((a) => a.rfWeight);

  if (objective === 'minRisk') {
    return minW;
  }

  // Blend Random Forest & Markowitz tangency portfolio according to RiskPreference
  const blend = (a: number[], b: number[], t: number) => {
    const res = a.map((v, i) => v * (1 - t) + b[i] * t);
    const sum = res.reduce((acc, x) => acc + x, 0);
    return sum > 0 ? res.map((x) => x / sum) : a;
  };

  if (riskPreference === 'conservador') {
    // 55% Min Risk + 45% Random Forest
    return blend(minW, rfW, 0.45);
  }
  if (riskPreference === 'agresivo') {
    // Tilt toward Max Sharpe + higher expected-return assets
    const retScores = analytics.assets.map((a) => Math.max(0.02, a.expectedReturn + 0.15));
    const retSum = retScores.reduce((s, v) => s + v, 0);
    const growthW = retScores.map((v) => v / retSum);
    return blend(maxSharpeW, growthW, 0.35);
  }

  // Moderado: 50% Max Sharpe Markowitz + 50% Random Forest Optimal
  return blend(maxSharpeW, rfW, 0.5);
}

const CONFIDENCE_Z: Record<PredictionConfidenceLevel, number> = {
  80: 1.2815515655446004,
  90: 1.6448536269514722,
  95: 1.959963984540054,
};

interface HorizonSpec {
  id: PredictionHorizonId;
  title: string;
  shortLabel: string;
  stepUnitSingular: string;
  stepPrefix: string;
  stepYears: number;
  stepsCount: number;
  horizonLabel: string;
}

const HORIZON_SPECS: HorizonSpec[] = [
  {
    id: 'daily',
    title: 'Diario',
    shortLabel: '1 Día',
    stepUnitSingular: 'día hábil',
    stepPrefix: 'Día',
    stepYears: 1 / 252,
    stepsCount: 30,
    horizonLabel: '30 días hábiles',
  },
  {
    id: 'weekly',
    title: 'Semanal',
    shortLabel: '1 Semana',
    stepUnitSingular: 'semana',
    stepPrefix: 'Sem',
    stepYears: 1 / 52,
    stepsCount: 26,
    horizonLabel: '26 semanas (6M)',
  },
  {
    id: 'monthly',
    title: 'Mensual',
    shortLabel: '1 Mes',
    stepUnitSingular: 'mes',
    stepPrefix: 'Mes',
    stepYears: 1 / 12,
    stepsCount: 12,
    horizonLabel: '12 meses (1A)',
  },
  {
    id: 'quarterly',
    title: 'Trimestral',
    shortLabel: '1 Trimestre',
    stepUnitSingular: 'trimestre',
    stepPrefix: 'Trim',
    stepYears: 1 / 4,
    stepsCount: 8,
    horizonLabel: '8 trimestres (2A)',
  },
  {
    id: 'semiannual',
    title: 'Semestral',
    shortLabel: '1 Semestre',
    stepUnitSingular: 'semestre',
    stepPrefix: 'Semes',
    stepYears: 1 / 2,
    stepsCount: 6,
    horizonLabel: '6 semestres (3A)',
  },
  {
    id: 'annual',
    title: 'Anual',
    shortLabel: '1 Año',
    stepUnitSingular: 'año',
    stepPrefix: 'Año',
    stepYears: 1,
    stepsCount: 5,
    horizonLabel: '5 años',
  },
];

export function computePortfolioPredictions(
  analytics: PortfolioAnalyticsResult,
  initialCapitalUsd: number,
  options?: {
    model?: PredictionReturnModel;
    confidenceLevel?: PredictionConfidenceLevel;
    periodicContributionUsd?: number;
  },
): PortfolioPredictionResult {
  const model: PredictionReturnModel = options?.model ?? 'historical';
  const confidenceLevel: PredictionConfidenceLevel = options?.confidenceLevel ?? 90;
  const zScore = CONFIDENCE_Z[confidenceLevel];
  const initialCapital = Math.max(0, Number(initialCapitalUsd) || 0);
  const periodicContributionUsd = Math.max(0, Number(options?.periodicContributionUsd) || 0);

  const annualExpectedReturn =
    model === 'random_forest'
      ? analytics.assets.reduce((acc, a) => acc + a.weight * a.rfPredictedReturn, 0)
      : analytics.portfolioExpectedReturn;

  const annualVolatility = Math.max(0, analytics.standardDeviation);
  const sharpeRatio =
    annualVolatility > 1e-6
      ? (annualExpectedReturn - analytics.riskFreeRate) / annualVolatility
      : 0;

  const assetProjectionsByHorizon = {} as Record<PredictionHorizonId, AssetHorizonProjection[]>;

  const horizons: HorizonSummaryCard[] = HORIZON_SPECS.map((spec) => {
    const dt = spec.stepYears;
    const m1 = Math.exp(annualExpectedReturn * dt);
    const m2 = Math.exp((2 * annualExpectedReturn + annualVolatility * annualVolatility) * dt);

    let meanV = initialCapital;
    let secondMomentV = initialCapital * initialCapital;

    const timeline: PredictionStepPoint[] = [
      {
        stepIndex: 0,
        label: 'Hoy',
        yearsElapsed: 0,
        contributedCapital: initialCapital,
        expectedValue: initialCapital,
        medianValue: initialCapital,
        pessimisticValue: initialCapital,
        optimisticValue: initialCapital,
        expectedGainUsd: 0,
        expectedReturnPct: 0,
      },
    ];

    for (let k = 1; k <= spec.stepsCount; k++) {
      // Fenton-Wilkinson exact recursive first and second moments under independent GBM steps
      const nextMean = meanV * m1 + periodicContributionUsd;
      const nextSecond =
        secondMomentV * m2 +
        2 * periodicContributionUsd * meanV * m1 +
        periodicContributionUsd * periodicContributionUsd;

      meanV = nextMean;
      secondMomentV = Math.max(nextMean * nextMean, nextSecond);

      const varianceV = Math.max(0, secondMomentV - meanV * meanV);
      const logVar = meanV > 1e-9 ? Math.log(1 + varianceV / (meanV * meanV)) : 0;
      const logStd = Math.sqrt(Math.max(0, logVar));

      const medianValue = meanV * Math.exp(-0.5 * logVar);
      const pessimisticValue = meanV * Math.exp(-0.5 * logVar - zScore * logStd);
      const optimisticValue = meanV * Math.exp(-0.5 * logVar + zScore * logStd);

      const contributedCapital = initialCapital + k * periodicContributionUsd;
      const expectedGainUsd = meanV - contributedCapital;
      const expectedReturnPct =
        contributedCapital > 1e-6 ? (expectedGainUsd / contributedCapital) * 100 : 0;

      timeline.push({
        stepIndex: k,
        label: `${spec.stepPrefix} ${k}`,
        yearsElapsed: k * dt,
        contributedCapital,
        expectedValue: meanV,
        medianValue,
        pessimisticValue,
        optimisticValue,
        expectedGainUsd,
        expectedReturnPct,
      });
    }

    const firstStep = timeline[1];
    const lastStep = timeline[timeline.length - 1];

    // Per-asset value projection (uses each asset's selected return model + individual allocation)
    assetProjectionsByHorizon[spec.id] = analytics.assets.map((asset) => {
      const assetMu = model === 'random_forest' ? asset.rfPredictedReturn : asset.expectedReturn;
      const allocated = initialCapital * asset.weight;
      const periodicSlice = periodicContributionUsd * asset.weight;

      const onePeriodVal = allocated * Math.exp(assetMu * dt) + periodicSlice;
      const onePeriodContributed = allocated + periodicSlice;

      let fullVal = allocated;
      const stepFactor = Math.exp(assetMu * dt);
      for (let k = 1; k <= spec.stepsCount; k++) {
        fullVal = fullVal * stepFactor + periodicSlice;
      }
      const fullContributed = allocated + spec.stepsCount * periodicSlice;

      return {
        symbol: asset.symbol,
        name: asset.name,
        weight: asset.weight,
        annualReturn: assetMu,
        annualVolatility: asset.standardDeviation,
        currentAllocatedUsd: allocated,
        projectedValueOnePeriod: onePeriodVal,
        projectedGainOnePeriodUsd: onePeriodVal - onePeriodContributed,
        projectedValueFullHorizon: fullVal,
        projectedGainFullHorizonUsd: fullVal - fullContributed,
      };
    });

    return {
      id: spec.id,
      title: spec.title,
      shortLabel: spec.shortLabel,
      stepUnitSingular: spec.stepUnitSingular,
      stepYears: dt,
      horizonStepsCount: spec.stepsCount,
      horizonLabel: spec.horizonLabel,
      onePeriodExpectedValue: firstStep.expectedValue,
      onePeriodMedianValue: firstStep.medianValue,
      onePeriodPessimisticValue: firstStep.pessimisticValue,
      onePeriodOptimisticValue: firstStep.optimisticValue,
      onePeriodGainUsd: firstStep.expectedGainUsd,
      onePeriodReturnPct: firstStep.expectedReturnPct,
      onePeriodVolatilityPct: annualVolatility * Math.sqrt(dt) * 100,
      fullHorizonEndExpectedValue: lastStep.expectedValue,
      fullHorizonEndMedianValue: lastStep.medianValue,
      fullHorizonEndPessimisticValue: lastStep.pessimisticValue,
      fullHorizonEndOptimisticValue: lastStep.optimisticValue,
      fullHorizonContributedCapital: lastStep.contributedCapital,
      timeline,
    };
  });

  return {
    model,
    confidenceLevel,
    zScore,
    initialCapital,
    periodicContributionUsd,
    annualExpectedReturn,
    annualVolatility,
    sharpeRatio,
    horizons,
    assetProjectionsByHorizon,
  };
}


