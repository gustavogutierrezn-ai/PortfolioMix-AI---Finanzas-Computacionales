export type SectorId =
  | 'tecnologia'
  | 'consumo'
  | 'biotecnologia'
  | 'mineria'
  | 'bancario'
  | 'multisector';

export interface SectorPortfolioPreset {
  id: SectorId;
  name: string;
  subtitle: string;
  description: string;
  tickers: string[];
  benchmarkLabel: string;
}

export interface MarketAssetSeries {
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

export interface MarketFeedResponse {
  assets: MarketAssetSeries[];
  riskFreeRate: number;
  benchmark: {
    symbol: string;
    name: string;
    price: number;
    changePct: number;
    vix: number | null;
  };
  fetchedAt: string;
  sources: string[];
}

export interface TickerSearchResult {
  symbol: string;
  shortname: string;
  exchange: string;
  quoteType: string;
}

export interface RandomForestFeatureImportance {
  feature: string;
  label: string;
  importance: number;
}

export interface AssetRiskMetrics {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  source: string;
  weight: number;
  rfWeight: number;
  equalWeight: number;
  expectedReturn: number;
  individualVariance: number;
  standardDeviation: number;
  sharpeRatio: number;
  rfPredictedReturn: number;
  rfPredictedRisk: number;
  marginalRiskContribution: number;
  componentRiskPct: number;
  beta: number;
  maxDrawdown: number;
  volatilityRank: number;
}

export interface PearsonMatrix {
  symbols: string[];
  matrix: number[][];
  covarianceMatrix: number[][];
  avgPairwiseCorrelation: number;
  minCorrelationPair: { a: string; b: string; value: number };
  maxCorrelationPair: { a: string; b: string; value: number };
}

export interface PortfolioAnalyticsResult {
  assets: AssetRiskMetrics[];
  pearson: PearsonMatrix;
  portfolioExpectedReturn: number;
  weightedVariance: number;
  naiveSumVariance: number;
  diversificationBenefitPct: number;
  standardDeviation: number;
  sharpeRatio: number;
  riskFreeRate: number;
  rfPortfolioReturn: number;
  rfPortfolioVolatility: number;
  rfPortfolioSharpe: number;
  equalWeightSharpe: number;
  featureImportances: RandomForestFeatureImportance[];
  oobR2Score: number;
  treeCount: number;
  dates: string[];
  equityCurveOptimal: number[];
  equityCurveEqual: number[];
  equityCurveCurrent: number[];
}

export interface StressScenario {
  id: string;
  name: string;
  description: string;
  marketShockPct: number;
  volMultiplier: number;
  rateShiftBps: number;
  correlationTarget: number;
  sectorAdjustments: Partial<Record<SectorId, number>>;
}

export interface StressTestOutput {
  scenarioName: string;
  baselineReturn: number;
  stressedReturn: number;
  baselineVolatility: number;
  stressedVolatility: number;
  stressedWeightedVariance: number;
  baselineSharpe: number;
  stressedSharpe: number;
  var95: number;
  cvar95: number;
  cvar99: number;
  estimatedDrawdownPct: number;
  drawdownMethodology: string;
  assetImpacts: {
    symbol: string;
    name: string;
    weight: number;
    baselineVol: number;
    stressedVol: number;
    projectedLossPct: number;
    riskContributionPct: number;
  }[];
}

export interface SavedPortfolioDoc {
  id: string;
  ownerId: string;
  name: string;
  sector: SectorId;
  tickers: string[];
  weights: number[];
  sharpeRatio: number;
  weightedVariance: number;
  standardDeviation: number;
  expectedReturn: number;
  riskFreeRate: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SavedStressTestDoc {
  id: string;
  ownerId: string;
  portfolioName: string;
  sector: string;
  scenarioName: string;
  marketShockPct: number;
  volMultiplier: number;
  rateShiftBps: number;
  stressedReturn: number;
  stressedVolatility: number;
  stressedSharpe: number;
  var95: number;
  createdAt?: unknown;
}

export interface UserProfileDoc {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  roleLabel?: string;
  defaultCapital?: number;
  onboardingCompleted?: boolean;
  activePortfolioName?: string;
  activeSector?: SectorId;
  activeTickers?: string[];
  activeWeights?: number[];
  activeRiskPreference?: RiskPreference;
  activeObjective?: OptimizationObjective;
  activeRange?: '3mo' | '6mo' | '1y' | '2y';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type RiskPreference = 'conservador' | 'moderado' | 'agresivo';
export type OptimizationObjective = 'maxSharpe' | 'minRisk' | 'custom';

export interface FrontierPoint {
  risk: number;
  expectedReturn: number;
  sharpe: number;
  weights: number[];
}

export interface MarkowitzFrontierResult {
  cloud: Array<{ risk: number; expectedReturn: number; sharpe: number }>;
  frontierCurve: Array<{ risk: number; expectedReturn: number; sharpe: number }>;
  minRiskPoint: FrontierPoint;
  maxSharpePoint: FrontierPoint;
  currentPoint: FrontierPoint;
}

export interface GeminiStructuredAnalysis {
  analysisSummary: string;
  strengths: string[];
  risks: string[];
  suggestion: string;
}

export interface GeminiRandomForestChartPoint {
  ticker: string;
  rfWeightPct: number;
  rfPredictedReturnPct: number;
  volatilityPct: number;
  sharpe: number;
  roleTag: string;
}

export interface GeminiRandomForestChartData {
  chartTitle: string;
  chartSubtitle: string;
  xAxisLabel: string;
  yAxisLabel: string;
  insight: string;
  topDriverLabel: string;
  points: GeminiRandomForestChartPoint[];
}

export interface GeminiKnnPoint {
  ticker: string;
  volatilityPct: number;
  expectedReturnPct: number;
  sharpe: number;
  clusterIndex: number;
  clusterLabel: string;
  nearestNeighbors: string[];
  neighborDistance: number;
}

export interface GeminiKnnCluster {
  clusterIndex: number;
  clusterName: string;
  summary: string;
}

export interface GeminiKnnChartData {
  chartTitle: string;
  chartSubtitle: string;
  kValue: number;
  xAxisLabel: string;
  yAxisLabel: string;
  insight: string;
  clusters: GeminiKnnCluster[];
  points: GeminiKnnPoint[];
}

export type SavedReportType = 'financial_analysis' | 'stress_test';

export interface SavedReportAssetDetail {
  symbol: string;
  name: string;
  weight: number;
  expectedReturn: number;
  volatility: number;
  sharpe: number;
  projectedLossPct?: number;
  riskContributionPct?: number;
}

export interface SavedReportModelParams {
  riskPreference: RiskPreference;
  objective: OptimizationObjective;
  range: '3mo' | '6mo' | '1y' | '2y';
  riskFreeRate: number;
  treeCount: number;
  oobR2Score: number;
  avgPearson: number;
}

export interface SavedReportStressParams {
  scenarioId: string;
  scenarioName: string;
  marketShockPct: number;
  volMultiplier: number;
  correlationTarget: number;
  rateShiftBps: number;
  drawdownMethodology: string;
}

export interface SavedReportMetrics {
  expectedReturn: number;
  volatility: number;
  weightedVariance: number;
  sharpeRatio: number;
  var95: number;
  cvar95: number;
  estimatedDrawdownPct?: number;
  baselineReturn?: number;
  baselineVolatility?: number;
  baselineSharpe?: number;
}

export interface SavedReportDoc {
  id: string;
  ownerId: string;
  reportType: SavedReportType;
  reportFingerprint: string;
  portfolioName: string;
  sector: SectorId;
  portfolioValue: number;
  tickers: string[];
  weights: number[];
  assetDetails: SavedReportAssetDetail[];
  modelParams: SavedReportModelParams;
  stressParams?: SavedReportStressParams;
  metrics: SavedReportMetrics;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PredictionHorizonId =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual';

export type PredictionReturnModel = 'historical' | 'random_forest';
export type PredictionConfidenceLevel = 80 | 90 | 95;

export interface PredictionStepPoint {
  stepIndex: number;
  label: string;
  yearsElapsed: number;
  contributedCapital: number;
  expectedValue: number;
  medianValue: number;
  pessimisticValue: number;
  optimisticValue: number;
  expectedGainUsd: number;
  expectedReturnPct: number;
}

export interface HorizonSummaryCard {
  id: PredictionHorizonId;
  title: string;
  shortLabel: string;
  stepUnitSingular: string;
  stepYears: number;
  horizonStepsCount: number;
  horizonLabel: string;
  onePeriodExpectedValue: number;
  onePeriodMedianValue: number;
  onePeriodPessimisticValue: number;
  onePeriodOptimisticValue: number;
  onePeriodGainUsd: number;
  onePeriodReturnPct: number;
  onePeriodVolatilityPct: number;
  fullHorizonEndExpectedValue: number;
  fullHorizonEndMedianValue: number;
  fullHorizonEndPessimisticValue: number;
  fullHorizonEndOptimisticValue: number;
  fullHorizonContributedCapital: number;
  timeline: PredictionStepPoint[];
}

export interface AssetHorizonProjection {
  symbol: string;
  name: string;
  weight: number;
  annualReturn: number;
  annualVolatility: number;
  currentAllocatedUsd: number;
  projectedValueOnePeriod: number;
  projectedGainOnePeriodUsd: number;
  projectedValueFullHorizon: number;
  projectedGainFullHorizonUsd: number;
}

export interface PortfolioPredictionResult {
  model: PredictionReturnModel;
  confidenceLevel: PredictionConfidenceLevel;
  zScore: number;
  initialCapital: number;
  periodicContributionUsd: number;
  annualExpectedReturn: number;
  annualVolatility: number;
  sharpeRatio: number;
  horizons: HorizonSummaryCard[];
  assetProjectionsByHorizon: Record<PredictionHorizonId, AssetHorizonProjection[]>;
}

