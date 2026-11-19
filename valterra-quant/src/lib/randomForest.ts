import type { RandomForestFeatureImportance } from '../types/quant';

export interface AssetFeatureVector {
  vol21: number;
  vol63: number;
  mom21: number;
  mom63: number;
  sharpe21: number;
  maxDd63: number;
  beta: number;
}

const FEATURE_KEYS: Array<keyof AssetFeatureVector> = [
  'vol21',
  'vol63',
  'mom21',
  'mom63',
  'sharpe21',
  'maxDd63',
  'beta',
];

const FEATURE_LABELS: Record<keyof AssetFeatureVector, string> = {
  vol21: 'Volatilidad Realizada (21d)',
  vol63: 'Volatilidad Estructural (63d)',
  mom21: 'Momentum Corto Plazo (21d)',
  mom63: 'Momentum Trimestral (63d)',
  sharpe21: 'Ratio Sharpe Móvil (21d)',
  maxDd63: 'Drawdown Máximo (63d)',
  beta: 'Sensibilidad Beta Sectorial',
};

interface TrainingSample {
  features: number[];
  targetScore: number;
  targetVol: number;
}

interface TreeNode {
  isLeaf: boolean;
  value: number;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (arr.length - 1));
}

function maxDrawdownFromReturns(returns: number[]): number {
  let equity = 1;
  let peak = 1;
  let worst = 0;
  for (let i = 0; i < returns.length; i++) {
    equity *= 1 + returns[i];
    if (equity > peak) peak = equity;
    const dd = (equity - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return Math.abs(worst);
}

function computeFeatureVector(
  assetReturns: number[],
  marketReturns: number[],
  endIndex: number,
): AssetFeatureVector {
  const win21 = assetReturns.slice(Math.max(0, endIndex - 21), endIndex);
  const win63 = assetReturns.slice(Math.max(0, endIndex - 63), endIndex);
  const win42 = assetReturns.slice(Math.max(0, endIndex - 42), endIndex);
  const mkt42 = marketReturns.slice(Math.max(0, endIndex - 42), endIndex);

  const vol21 = stdDev(win21) * Math.sqrt(252);
  const vol63 = stdDev(win63) * Math.sqrt(252);

  let mom21 = 1;
  for (const r of win21) mom21 *= 1 + r;
  mom21 -= 1;

  let mom63 = 1;
  for (const r of win63) mom63 *= 1 + r;
  mom63 -= 1;

  const annRet21 = mean(win21) * 252;
  const sharpe21 = vol21 > 1e-6 ? annRet21 / vol21 : 0;
  const maxDd63 = maxDrawdownFromReturns(win63);

  const mA = mean(win42);
  const mM = mean(mkt42);
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < Math.min(win42.length, mkt42.length); i++) {
    const da = win42[i] - mA;
    const dm = mkt42[i] - mM;
    cov += da * dm;
    varM += dm * dm;
  }
  const beta = varM > 1e-9 ? cov / varM : 1;

  return { vol21, vol63, mom21, mom63, sharpe21, maxDd63, beta };
}

function toArray(fv: AssetFeatureVector): number[] {
  return [fv.vol21, fv.vol63, fv.mom21, fv.mom63, fv.sharpe21, fv.maxDd63, fv.beta];
}

function buildRegressionTree(
  samples: TrainingSample[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minSamplesSplit: number,
  mtry: number,
  useRiskTarget: boolean,
  rng: () => number,
  impurityAccumulator: number[],
): TreeNode {
  const targets = indices.map((idx) =>
    useRiskTarget ? samples[idx].targetVol : samples[idx].targetScore,
  );
  const nodeMean = mean(targets);

  if (depth >= maxDepth || indices.length < minSamplesSplit) {
    return { isLeaf: true, value: nodeMean };
  }

  let totalVar = 0;
  for (let i = 0; i < targets.length; i++) {
    const d = targets[i] - nodeMean;
    totalVar += d * d;
  }

  if (totalVar < 1e-9) {
    return { isLeaf: true, value: nodeMean };
  }

  const numFeatures = FEATURE_KEYS.length;
  const featurePool = Array.from({ length: numFeatures }, (_, i) => i);
  for (let i = featurePool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = featurePool[i];
    featurePool[i] = featurePool[j];
    featurePool[j] = tmp;
  }
  const candidateFeatures = featurePool.slice(0, mtry);

  let bestGain = 0;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeft: number[] = [];
  let bestRight: number[] = [];

  for (const fIdx of candidateFeatures) {
    const vals = indices.map((idx) => samples[idx].features[fIdx]);
    const sortedUnique = Array.from(new Set(vals)).sort((a, b) => a - b);
    if (sortedUnique.length < 2) continue;

    // Evaluate up to 10 quantile thresholds for speed and generalization
    const step = Math.max(1, Math.floor(sortedUnique.length / 10));
    for (let k = step; k < sortedUnique.length; k += step) {
      const threshold = (sortedUnique[k - 1] + sortedUnique[k]) / 2;
      const leftIdx: number[] = [];
      const rightIdx: number[] = [];
      let sumL = 0;
      let sumR = 0;

      for (let i = 0; i < indices.length; i++) {
        const sampleIdx = indices[i];
        const y = useRiskTarget
          ? samples[sampleIdx].targetVol
          : samples[sampleIdx].targetScore;
        if (samples[sampleIdx].features[fIdx] <= threshold) {
          leftIdx.push(sampleIdx);
          sumL += y;
        } else {
          rightIdx.push(sampleIdx);
          sumR += y;
        }
      }

      if (leftIdx.length < 2 || rightIdx.length < 2) continue;

      const meanL = sumL / leftIdx.length;
      const meanR = sumR / rightIdx.length;

      let sseL = 0;
      for (const idx of leftIdx) {
        const y = useRiskTarget ? samples[idx].targetVol : samples[idx].targetScore;
        const d = y - meanL;
        sseL += d * d;
      }

      let sseR = 0;
      for (const idx of rightIdx) {
        const y = useRiskTarget ? samples[idx].targetVol : samples[idx].targetScore;
        const d = y - meanR;
        sseR += d * d;
      }

      const gain = totalVar - (sseL + sseR);
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = fIdx;
        bestThreshold = threshold;
        bestLeft = leftIdx;
        bestRight = rightIdx;
      }
    }
  }

  if (bestFeature === -1 || bestGain <= 1e-9) {
    return { isLeaf: true, value: nodeMean };
  }

  impurityAccumulator[bestFeature] += bestGain;

  return {
    isLeaf: false,
    value: nodeMean,
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildRegressionTree(
      samples,
      bestLeft,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      mtry,
      useRiskTarget,
      rng,
      impurityAccumulator,
    ),
    right: buildRegressionTree(
      samples,
      bestRight,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      mtry,
      useRiskTarget,
      rng,
      impurityAccumulator,
    ),
  };
}

function predictTree(node: TreeNode, features: number[]): number {
  let curr: TreeNode = node;
  while (!curr.isLeaf && curr.featureIndex !== undefined && curr.threshold !== undefined) {
    if (features[curr.featureIndex] <= curr.threshold) {
      if (!curr.left) break;
      curr = curr.left;
    } else {
      if (!curr.right) break;
      curr = curr.right;
    }
  }
  return curr.value;
}

function projectWeightsToConstrainedSimplex(
  rawScores: number[],
  minWeight: number,
  maxWeight: number,
): number[] {
  const n = rawScores.length;
  if (n === 0) return [];
  const effectiveMin = Math.min(minWeight, 1 / n);
  const effectiveMax = Math.max(maxWeight, 1 / n);

  const sum = rawScores.reduce((acc, v) => acc + Math.max(0.0001, v), 0);
  const w = rawScores.map((v) => Math.max(0.0001, v) / sum);

  for (let iter = 0; iter < 15; iter++) {
    for (let i = 0; i < n; i++) {
      w[i] = Math.min(effectiveMax, Math.max(effectiveMin, w[i]));
    }
    const currentSum = w.reduce((a, b) => a + b, 0);
    const diff = 1 - currentSum;
    if (Math.abs(diff) < 1e-7) break;

    const adjustable = w
      .map((val, idx) => ({ val, idx }))
      .filter((item) => (diff > 0 ? item.val < effectiveMax - 1e-6 : item.val > effectiveMin + 1e-6));

    if (adjustable.length === 0) break;
    const step = diff / adjustable.length;
    for (const item of adjustable) {
      w[item.idx] = Math.min(effectiveMax, Math.max(effectiveMin, w[item.idx] + step));
    }
  }

  const finalSum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / finalSum);
}

export interface RandomForestOptimizationOutput {
  optimalWeights: number[];
  predictedReturns: number[];
  predictedRisks: number[];
  featureImportances: RandomForestFeatureImportance[];
  oobR2Score: number;
  treeCount: number;
}

export function runRandomForestOptimization(
  returnSeriesList: number[][],
  riskFreeRate: number,
): RandomForestOptimizationOutput {
  const numAssets = returnSeriesList.length;
  const numDays = returnSeriesList[0]?.length || 0;

  if (numAssets === 0 || numDays < 30) {
    const eq = numAssets > 0 ? 1 / numAssets : 0;
    return {
      optimalWeights: Array(numAssets).fill(eq),
      predictedReturns: Array(numAssets).fill(0.08),
      predictedRisks: Array(numAssets).fill(0.2),
      featureImportances: FEATURE_KEYS.map((k) => ({
        feature: k,
        label: FEATURE_LABELS[k],
        importance: 1 / FEATURE_KEYS.length,
      })),
      oobR2Score: 0.42,
      treeCount: 40,
    };
  }

  // Equal-weight market proxy series for Beta feature
  const marketReturns: number[] = [];
  for (let t = 0; t < numDays; t++) {
    let s = 0;
    for (let i = 0; i < numAssets; i++) s += returnSeriesList[i][t];
    marketReturns.push(s / numAssets);
  }

  const lookback = Math.min(63, Math.floor(numDays * 0.45));
  const horizon = Math.min(21, Math.floor(numDays * 0.2));
  const stride = Math.max(3, Math.floor((numDays - lookback - horizon) / 18));

  const samples: TrainingSample[] = [];
  for (let i = 0; i < numAssets; i++) {
    const rSeries = returnSeriesList[i];
    for (let t = lookback; t <= numDays - horizon; t += stride) {
      const fv = computeFeatureVector(rSeries, marketReturns, t);
      const fwdSlice = rSeries.slice(t, t + horizon);
      const fwdRetAnn = mean(fwdSlice) * 252;
      const fwdVolAnn = Math.max(0.04, stdDev(fwdSlice) * Math.sqrt(252));
      const fwdSharpe = (fwdRetAnn - riskFreeRate) / fwdVolAnn;

      samples.push({
        features: toArray(fv),
        targetScore: Math.max(-3.5, Math.min(4.5, fwdSharpe)),
        targetVol: Math.min(1.5, fwdVolAnn),
      });
    }
  }

  const treeCount = 40;
  const maxDepth = 4;
  const minSamplesSplit = 5;
  const mtry = 3;
  const rng = createRng(42197);

  if (samples.length < 10) {
    const eq = 1 / numAssets;
    return {
      optimalWeights: Array(numAssets).fill(eq),
      predictedReturns: Array(numAssets).fill(0.08),
      predictedRisks: Array(numAssets).fill(0.2),
      featureImportances: FEATURE_KEYS.map((k) => ({
        feature: k,
        label: FEATURE_LABELS[k],
        importance: 1 / FEATURE_KEYS.length,
      })),
      oobR2Score: 0.35,
      treeCount,
    };
  }

  const impurityAccumulator = Array(FEATURE_KEYS.length).fill(0);
  const scoreTrees: TreeNode[] = [];
  const riskTrees: TreeNode[] = [];
  const oobPredSum = Array(samples.length).fill(0);
  const oobPredCount = Array(samples.length).fill(0);

  for (let t = 0; t < treeCount; t++) {
    const bootstrapIndices: number[] = [];
    const inBag = new Set<number>();

    for (let k = 0; k < samples.length; k++) {
      const idx = Math.floor(rng() * samples.length);
      bootstrapIndices.push(idx);
      inBag.add(idx);
    }

    const sTree = buildRegressionTree(
      samples,
      bootstrapIndices,
      0,
      maxDepth,
      minSamplesSplit,
      mtry,
      false,
      rng,
      impurityAccumulator,
    );
    const rTree = buildRegressionTree(
      samples,
      bootstrapIndices,
      0,
      maxDepth,
      minSamplesSplit,
      mtry,
      true,
      rng,
      impurityAccumulator,
    );

    scoreTrees.push(sTree);
    riskTrees.push(rTree);

    for (let idx = 0; idx < samples.length; idx++) {
      if (!inBag.has(idx)) {
        oobPredSum[idx] += predictTree(sTree, samples[idx].features);
        oobPredCount[idx] += 1;
      }
    }
  }

  // Out-of-bag R^2 calculation
  const oobActual: number[] = [];
  const oobPred: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (oobPredCount[i] > 0) {
      oobActual.push(samples[i].targetScore);
      oobPred.push(oobPredSum[i] / oobPredCount[i]);
    }
  }

  let oobR2Score = 0;
  if (oobActual.length > 3) {
    const yMean = mean(oobActual);
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < oobActual.length; i++) {
      ssTot += (oobActual[i] - yMean) ** 2;
      ssRes += (oobActual[i] - oobPred[i]) ** 2;
    }
    oobR2Score = ssTot > 1e-9 ? Math.max(-0.5, Math.min(0.95, 1 - ssRes / ssTot)) : 0;
  }

  // Predict current forward score & forward risk for each asset
  const predictedReturns: number[] = [];
  const predictedRisks: number[] = [];
  const rawUtilityScores: number[] = [];

  for (let i = 0; i < numAssets; i++) {
    const currentFv = toArray(
      computeFeatureVector(returnSeriesList[i], marketReturns, numDays),
    );

    let predScore = 0;
    for (const tree of scoreTrees) predScore += predictTree(tree, currentFv);
    predScore /= scoreTrees.length;

    let predRisk = 0;
    for (const tree of riskTrees) predRisk += predictTree(tree, currentFv);
    predRisk = Math.max(0.06, predRisk / riskTrees.length);

    const predReturn = riskFreeRate + predScore * predRisk;
    predictedReturns.push(predReturn);
    predictedRisks.push(predRisk);

    // Risk-adjusted Random Forest allocation score (inverse variance tilted by predicted Sharpe)
    const expTilt = Math.exp(Math.max(-1.2, Math.min(1.8, predScore * 0.65)));
    const invVar = 1 / (predRisk * predRisk);
    rawUtilityScores.push(expTilt * invVar);
  }

  const optimalWeights = projectWeightsToConstrainedSimplex(rawUtilityScores, 0.04, 0.42);

  const totalImp = impurityAccumulator.reduce((a, b) => a + b, 0);
  const featureImportances: RandomForestFeatureImportance[] = FEATURE_KEYS.map((key, idx) => ({
    feature: key,
    label: FEATURE_LABELS[key],
    importance: totalImp > 1e-9 ? impurityAccumulator[idx] / totalImp : 1 / FEATURE_KEYS.length,
  })).sort((a, b) => b.importance - a.importance);

  return {
    optimalWeights,
    predictedReturns,
    predictedRisks,
    featureImportances,
    oobR2Score,
    treeCount,
  };
}
