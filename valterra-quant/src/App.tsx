import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Activity,
  AlertCircle,
  BookmarkPlus,
  Check,
  ChevronDown,
  Coins,
  Crown,
  Download,
  FileText,
  Info,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Shield,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutAccount,
} from './lib/firebase';
import { SECTOR_PRESETS } from './data/portfolios';
import {
  analyzePortfolio,
  buildReportFingerprint,
  computeMarkowitzFrontier,
  computeParametricVarCvar95,
  solveObjectiveWeights,
} from './lib/quantEngine';
import type {
  MarketFeedResponse,
  OptimizationObjective,
  PortfolioAnalyticsResult,
  RiskPreference,
  SavedPortfolioDoc,
  SavedReportAssetDetail,
  SavedReportDoc,
  SavedReportModelParams,
  SavedStressTestDoc,
  SectorId,
  TickerSearchResult,
  UserProfileDoc,
} from './types/quant';
import { LoginScreen } from './components/LoginScreen';
import { SidebarNav, type SidebarTab } from './components/SidebarNav';
import { DistributionDonut } from './components/DistributionDonut';
import { MarkowitzChart } from './components/MarkowitzChart';
import { SelectedAssetsTable } from './components/SelectedAssetsTable';
import { GeminiAdvisorPanel } from './components/GeminiAdvisorPanel';
import { RandomForestPanel } from './components/RandomForestPanel';
import { PearsonMatrixPanel } from './components/PearsonMatrixPanel';
import { VolatilitySortPanel } from './components/VolatilitySortPanel';
import {
  StressTestLab,
  type SaveReportActionResult,
  type StressReportSavePayload,
} from './components/StressTestLab';
import { AccountView, HistoryView } from './components/AccountAndHistoryViews';
import { PortfolioOnboardingModal } from './components/PortfolioOnboardingModal';
import { PortfolioPredictionView } from './components/PortfolioPredictionView';

function formatShortName(displayName: string | null | undefined, email: string | null | undefined): string {
  if (displayName && displayName.trim().length > 0) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
    }
    return parts[0];
  }
  return email ? email.split('@')[0] : 'Inversionista';
}

function getInitials(displayName: string | null | undefined, email: string | null | undefined): string {
  const source = displayName?.trim() || email?.trim() || 'PM';
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [dashboardStep, setDashboardStep] = useState<1 | 2 | 3>(3);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Auth & Firestore User State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileDoc | null>(null);
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolioDoc[]>([]);
  const [savedStressTests, setSavedStressTests] = useState<SavedStressTestDoc[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReportDoc[]>([]);

  // Portfolio Configuration State (starts at $0 and 0 assets for new accounts)
  const [selectedSector, setSelectedSector] = useState<SectorId>('multisector');
  const [tickers, setTickers] = useState<string[]>([]);
  const [portfolioName, setPortfolioName] = useState<string>('Mi Portafolio');
  const [portfolioValue, setPortfolioValue] = useState<number>(0);
  const [range, setRange] = useState<'3mo' | '6mo' | '1y' | '2y'>('1y');

  // Onboarding & Per-User Workspace Hydration
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const hydratedUidRef = useRef<string | null>(null);
  const skipNextSyncRef = useRef(false);

  // Optimization Controls
  const [riskPreference, setRiskPreference] = useState<RiskPreference>('moderado');
  const [objective, setObjective] = useState<OptimizationObjective>('maxSharpe');
  const [customWeightsMap, setCustomWeightsMap] = useState<Record<string, number> | null>(null);
  const [showRiskTooltip, setShowRiskTooltip] = useState(false);

  // Live Market Data State
  const [marketData, setMarketData] = useState<MarketFeedResponse | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Search Tickers
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Save Feedback & Stress Preselection
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<SaveReportActionResult | null>(null);
  const [stressPreselectPortfolioId, setStressPreselectPortfolioId] = useState<string | null>(null);

  // Sync Dark Mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Firebase Auth listener & UserProfile sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clear previous account's in-memory state when switching or signing out
      if (firebaseUser?.uid !== hydratedUidRef.current) {
        hydratedUidRef.current = null;
        setProfileHydrated(false);
        setShowOnboardingModal(false);
        setTickers([]);
        setPortfolioValue(0);
        setPortfolioName('Mi Portafolio');
        setSelectedSector('multisector');
        setRiskPreference('moderado');
        setObjective('maxSharpe');
        setRange('1y');
        setCustomWeightsMap(null);
        setMarketData(null);
        setMarketError(null);
        setSavedReports([]);
        setReportFeedback(null);
        setStressPreselectPortfolioId(null);
      }

      setUser(firebaseUser);
      setAuthReady(true);

      if (firebaseUser && firebaseUser.emailVerified && firebaseUser.email) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const snap = await getDoc(userRef);
          const displayName = (firebaseUser.displayName || 'Cliente PortfolioMix').slice(0, 120);
          const email = firebaseUser.email.slice(0, 180);
          const photoURL =
            firebaseUser.photoURL && firebaseUser.photoURL.length <= 500
              ? firebaseUser.photoURL
              : undefined;

          if (!snap.exists()) {
            const payload: Record<string, unknown> = {
              uid: firebaseUser.uid,
              displayName,
              email,
              roleLabel: 'Inversionista',
              defaultCapital: 0,
              onboardingCompleted: false,
              activePortfolioName: 'Mi Portafolio',
              activeSector: 'multisector',
              activeTickers: [],
              activeWeights: [],
              activeRiskPreference: 'moderado',
              activeObjective: 'maxSharpe',
              activeRange: '1y',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            if (photoURL) payload.photoURL = photoURL;
            await setDoc(userRef, payload);
          } else {
            const updatePayload: Record<string, unknown> = {
              displayName,
              email,
              updatedAt: serverTimestamp(),
            };
            if (photoURL) updatePayload.photoURL = photoURL;
            await updateDoc(userRef, updatePayload);
          }
        } catch (err) {
          console.error('Error sincronizando perfil:', err);
        }
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Firestore real-time listeners (profile + per-user workspace hydration, portfolios, stressTests)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setUserProfile(null);
      setSavedPortfolios([]);
      setSavedStressTests([]);
      setSavedReports([]);
      return;
    }

    const userDocPath = `users/${user.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, userDocPath),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfileDoc;
          setUserProfile(data);

          // Hydrate workspace strictly on initial load for this UID
          if (hydratedUidRef.current !== user.uid) {
            hydratedUidRef.current = user.uid;
            skipNextSyncRef.current = true;

            const savedTickers = Array.isArray(data.activeTickers) ? data.activeTickers : [];
            const savedCap =
              typeof data.defaultCapital === 'number' && data.defaultCapital >= 0
                ? data.defaultCapital
                : 0;
            const hasWorkspaceInit =
              data.onboardingCompleted === true || savedTickers.length >= 2;

            const effectiveCap = hasWorkspaceInit ? savedCap : 0;
            const effectiveTickers = hasWorkspaceInit ? savedTickers : [];

            setPortfolioValue(effectiveCap);
            setTickers(effectiveTickers);
            if (data.activePortfolioName) setPortfolioName(data.activePortfolioName);
            if (data.activeSector) setSelectedSector(data.activeSector);
            if (data.activeRiskPreference) setRiskPreference(data.activeRiskPreference);
            if (data.activeObjective) setObjective(data.activeObjective);
            if (data.activeRange) setRange(data.activeRange);

            if (
              data.activeObjective === 'custom' &&
              Array.isArray(data.activeWeights) &&
              data.activeWeights.length === effectiveTickers.length &&
              effectiveTickers.length >= 2
            ) {
              const map: Record<string, number> = {};
              effectiveTickers.forEach((t, idx) => {
                map[t] = data.activeWeights![idx] ?? 1 / effectiveTickers.length;
              });
              setCustomWeightsMap(map);
            } else {
              setCustomWeightsMap(null);
            }

            setProfileHydrated(true);
            if (!hasWorkspaceInit || (effectiveCap === 0 && effectiveTickers.length === 0)) {
              setShowOnboardingModal(true);
            }
          } else if (
            typeof data.defaultCapital === 'number' &&
            data.defaultCapital >= 0
          ) {
            setPortfolioValue(data.defaultCapital);
          }
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, userDocPath);
      },
    );

    const portfoliosPath = `users/${user.uid}/portfolios`;
    const portfoliosQuery = query(
      collection(db, portfoliosPath),
      where('ownerId', '==', user.uid),
    );
    const unsubPortfolios = onSnapshot(
      portfoliosQuery,
      (snapshot) => {
        const items: SavedPortfolioDoc[] = snapshot.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SavedPortfolioDoc, 'id'>),
          }))
          .sort((a, b) => {
            const ta = (a.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            const tb = (b.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            return tb - ta;
          });
        setSavedPortfolios(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, portfoliosPath);
      },
    );

    const stressPath = `users/${user.uid}/stressTests`;
    const stressQuery = query(
      collection(db, stressPath),
      where('ownerId', '==', user.uid),
    );
    const unsubStress = onSnapshot(
      stressQuery,
      (snapshot) => {
        const items: SavedStressTestDoc[] = snapshot.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SavedStressTestDoc, 'id'>),
          }))
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            return tb - ta;
          });
        setSavedStressTests(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, stressPath);
      },
    );

    const reportsPath = `users/${user.uid}/reports`;
    const reportsQuery = query(
      collection(db, reportsPath),
      where('ownerId', '==', user.uid),
    );
    const unsubReports = onSnapshot(
      reportsQuery,
      (snapshot) => {
        const items: SavedReportDoc[] = snapshot.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SavedReportDoc, 'id'>),
          }))
          .sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            return tb - ta;
          });
        setSavedReports(items);
      },
      (err) => {
        console.error('Error escuchando reportes guardados:', err);
      },
    );

    return () => {
      unsubProfile();
      unsubPortfolios();
      unsubStress();
      unsubReports();
    };
  }, [authReady, user]);

  // Debounced auto-save of the authenticated user's active workspace to Firestore
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !profileHydrated) return;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }

    const boundedTickers = tickers.slice(0, 12).map((t) => t.slice(0, 16));
    const boundedWeights =
      objective === 'custom' && customWeightsMap
        ? boundedTickers.map((t) => Number((customWeightsMap[t] ?? 0).toFixed(6)))
        : [];

    const timer = setTimeout(async () => {
      const userPath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          defaultCapital: Math.min(1000000000, Math.max(0, Number(portfolioValue) || 0)),
          activePortfolioName: portfolioName.trim().slice(0, 100) || 'Mi Portafolio',
          activeSector: selectedSector,
          activeTickers: boundedTickers,
          activeWeights: boundedWeights,
          activeRiskPreference: riskPreference,
          activeObjective: objective,
          activeRange: range,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [
    authReady,
    user,
    profileHydrated,
    tickers,
    portfolioValue,
    portfolioName,
    selectedSector,
    riskPreference,
    objective,
    range,
    customWeightsMap,
  ]);

  // Fetch real market data from Yahoo Finance / Stooq (only when >= 2 tickers)
  useEffect(() => {
    if (tickers.length < 2) {
      setMarketData(null);
      setMarketError(null);
      setLoadingMarket(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoadingMarket(true);
      setMarketError(null);
      try {
        const res = await fetch(
          `/api/market/portfolio-data?symbols=${encodeURIComponent(
            tickers.join(','),
          )}&range=${range}`,
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Error obteniendo cotizaciones en vivo.');
        }
        if (!cancelled) {
          setMarketData(json as MarketFeedResponse);
        }
      } catch (err) {
        if (!cancelled) {
          setMarketError(
            err instanceof Error
              ? err.message
              : 'No se pudo conectar con Yahoo Finance.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingMarket(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tickers, range, refreshNonce]);

  // Live Yahoo Finance ticker search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (!cancelled) {
          setSearchResults(json.quotes || []);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Base quantitative analytics (Random Forest + Pearson + Covariance)
  const baseAnalytics = useMemo(() => {
    if (!marketData || marketData.assets.length < 2) return null;
    return analyzePortfolio(marketData.assets, marketData.riskFreeRate, null);
  }, [marketData]);

  // Active weights according to RiskPreference & OptimizationObjective
  const activeWeights = useMemo(() => {
    if (!baseAnalytics || !marketData) return null;
    if (objective === 'custom' && customWeightsMap) {
      return marketData.assets.map(
        (a) => customWeightsMap[a.symbol] ?? 1 / marketData.assets.length,
      );
    }
    return solveObjectiveWeights(baseAnalytics, riskPreference, objective);
  }, [baseAnalytics, marketData, objective, customWeightsMap, riskPreference]);

  // Full analytics evaluated at activeWeights
  const analytics = useMemo(() => {
    if (!marketData || marketData.assets.length < 2) return null;
    return analyzePortfolio(marketData.assets, marketData.riskFreeRate, activeWeights);
  }, [marketData, activeWeights]);

  // Markowitz Efficient Frontier + Monte Carlo cloud
  const frontier = useMemo(() => {
    if (!analytics) return null;
    return computeMarkowitzFrontier(analytics);
  }, [analytics]);

  // Handlers
  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo completar el acceso.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setProfileMenuOpen(false);
    setGuestMode(false);
    await signOutAccount();
  };

  const handleSelectSector = (sectorId: SectorId) => {
    const preset = SECTOR_PRESETS.find((s) => s.id === sectorId) || SECTOR_PRESETS[0];
    setSelectedSector(sectorId);
    setTickers(preset.tickers);
    setPortfolioName(preset.name);
    setObjective('maxSharpe');
    setCustomWeightsMap(null);
    setSavedNotice(false);
  };

  const handleAddTicker = (sym: string) => {
    const clean = sym.trim().toUpperCase();
    if (!clean || tickers.includes(clean) || tickers.length >= 12) return;
    setTickers([...tickers, clean]);
    setSearchQuery('');
    setSearchResults([]);
    setObjective('maxSharpe');
    setCustomWeightsMap(null);
  };

  const handleRemoveTicker = (sym: string) => {
    setTickers(tickers.filter((t) => t !== sym));
    setObjective('maxSharpe');
    setCustomWeightsMap(null);
  };

  const handleCompleteOnboarding = async (payload: {
    capital: number;
    tickers: string[];
    portfolioName: string;
    sector: SectorId;
  }) => {
    const boundedTickers = payload.tickers.slice(0, 12).map((t) => t.slice(0, 16));
    skipNextSyncRef.current = true;
    setPortfolioValue(payload.capital);
    setTickers(boundedTickers);
    setPortfolioName(payload.portfolioName);
    setSelectedSector(payload.sector);
    setObjective('maxSharpe');
    setCustomWeightsMap(null);
    setShowOnboardingModal(false);
    setActiveTab('dashboard');
    setDashboardStep(3);

    if (user && user.emailVerified) {
      const userPath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          defaultCapital: payload.capital,
          activeTickers: boundedTickers,
          activePortfolioName: payload.portfolioName,
          activeSector: payload.sector,
          activeObjective: 'maxSharpe',
          activeWeights: [],
          onboardingCompleted: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    }
  };

  const handleUpdateCustomWeight = (symbol: string, pctValue: number) => {
    if (!analytics) return;
    setObjective('custom');
    const targetFrac = Math.max(0, Math.min(0.9, pctValue / 100));
    const currentMap: Record<string, number> = {};
    analytics.assets.forEach((a) => {
      currentMap[a.symbol] = customWeightsMap?.[a.symbol] ?? a.weight;
    });

    const others = analytics.assets.filter((a) => a.symbol !== symbol);
    const othersSum = others.reduce((s, a) => s + currentMap[a.symbol], 0);
    const remaining = Math.max(0.0001, 1 - targetFrac);

    const nextMap: Record<string, number> = { [symbol]: targetFrac };
    others.forEach((a) => {
      nextMap[a.symbol] =
        othersSum > 1e-6
          ? (currentMap[a.symbol] / othersSum) * remaining
          : remaining / others.length;
    });

    setCustomWeightsMap(nextMap);
  };

  const handleApplyPresetFromPanel = (mode: 'rf' | 'equal' | 'invVol' | 'minRisk') => {
    if (!analytics) return;
    if (mode === 'minRisk') {
      setObjective('minRisk');
      setCustomWeightsMap(null);
      return;
    }
    const next: Record<string, number> = {};
    if (mode === 'rf') {
      analytics.assets.forEach((a) => {
        next[a.symbol] = a.rfWeight;
      });
      setObjective('custom');
      setCustomWeightsMap(next);
      return;
    }
    if (mode === 'equal') {
      const w = 1 / analytics.assets.length;
      analytics.assets.forEach((a) => {
        next[a.symbol] = w;
      });
    } else {
      const invVols = analytics.assets.map((a) =>
        a.standardDeviation > 1e-6 ? 1 / a.standardDeviation : 1,
      );
      const total = invVols.reduce((s, v) => s + v, 0);
      analytics.assets.forEach((a, idx) => {
        next[a.symbol] = invVols[idx] / total;
      });
    }
    setObjective('custom');
    setCustomWeightsMap(next);
  };

  const handleSaveCurrentPortfolio = async () => {
    if (!analytics) return;
    if (!user) {
      handleSignIn();
      return;
    }
    setSavingPortfolio(true);
    const colPath = `users/${user.uid}/portfolios`;
    try {
      const boundedTickers = analytics.assets.slice(0, 12).map((a) => a.symbol.slice(0, 16));
      const boundedWeights = analytics.assets
        .slice(0, boundedTickers.length)
        .map((a) => Number(a.weight.toFixed(6)));

      await addDoc(collection(db, colPath), {
        ownerId: user.uid,
        name: portfolioName.trim().slice(0, 100) || 'Portafolio Mix',
        sector: selectedSector,
        tickers: boundedTickers,
        weights: boundedWeights,
        sharpeRatio: Number(analytics.sharpeRatio.toFixed(4)),
        weightedVariance: Math.max(0, Number(analytics.weightedVariance.toFixed(6))),
        standardDeviation: Math.max(0, Number(analytics.standardDeviation.toFixed(6))),
        expectedReturn: Number(analytics.portfolioExpectedReturn.toFixed(6)),
        riskFreeRate: Number(analytics.riskFreeRate.toFixed(6)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, colPath);
    } finally {
      setSavingPortfolio(false);
    }
  };

  const buildModelParamsSnapshot = (target: PortfolioAnalyticsResult): SavedReportModelParams => ({
    riskPreference,
    objective,
    range,
    riskFreeRate: Number(target.riskFreeRate.toFixed(6)),
    treeCount: target.treeCount,
    oobR2Score: Number(target.oobR2Score.toFixed(4)),
    avgPearson: Number(target.pearson.avgPairwiseCorrelation.toFixed(4)),
  });

  const handleSaveFinancialReport = async () => {
    if (!analytics) return;
    if (!user) {
      handleSignIn();
      return;
    }
    setSavingReport(true);
    setReportFeedback(null);

    try {
      const cleanName = portfolioName.trim().slice(0, 100) || 'Portafolio Mix';
      const boundedAssets = analytics.assets.slice(0, 12);
      const boundedTickers = boundedAssets.map((a) => a.symbol.slice(0, 16));
      const boundedWeights = boundedAssets.map((a) => Number(a.weight.toFixed(4)));
      const safeCap = Math.min(1000000000, Math.max(0, Math.round(Number(portfolioValue) || 0)));

      const canonicalKey = JSON.stringify({
        type: 'financial_analysis',
        portfolioName: cleanName,
        sector: selectedSector,
        portfolioValue: safeCap,
        tickers: boundedTickers,
        weights: boundedWeights,
        riskPreference,
        objective,
        range,
      });
      const reportFingerprint = buildReportFingerprint(canonicalKey);

      if (savedReports.some((r) => r.reportFingerprint === reportFingerprint || r.id === reportFingerprint)) {
        setReportFeedback({
          status: 'duplicate',
          message:
            'Este reporte financiero con los mismos activos, pesos y parámetros ya está guardado en tu cuenta.',
        });
        return;
      }

      const { var95, cvar95 } = computeParametricVarCvar95(
        analytics.portfolioExpectedReturn,
        analytics.standardDeviation,
      );

      const assetDetails: SavedReportAssetDetail[] = boundedAssets.map((a) => ({
        symbol: a.symbol.slice(0, 16),
        name: a.name.slice(0, 100),
        weight: Number(a.weight.toFixed(6)),
        expectedReturn: Number(a.expectedReturn.toFixed(6)),
        volatility: Number(a.standardDeviation.toFixed(6)),
        sharpe: Number(a.sharpeRatio.toFixed(4)),
        riskContributionPct: Number(a.componentRiskPct.toFixed(2)),
      }));

      await setDoc(doc(db, 'users', user.uid, 'reports', reportFingerprint), {
        ownerId: user.uid,
        reportType: 'financial_analysis',
        reportFingerprint,
        portfolioName: cleanName,
        sector: selectedSector,
        portfolioValue: safeCap,
        tickers: boundedTickers,
        weights: boundedWeights,
        assetDetails,
        modelParams: buildModelParamsSnapshot(analytics),
        metrics: {
          expectedReturn: Number(analytics.portfolioExpectedReturn.toFixed(6)),
          volatility: Math.max(0, Number(analytics.standardDeviation.toFixed(6))),
          weightedVariance: Math.max(0, Number(analytics.weightedVariance.toFixed(6))),
          sharpeRatio: Number(analytics.sharpeRatio.toFixed(4)),
          var95: Number(var95.toFixed(6)),
          cvar95: Number(cvar95.toFixed(6)),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setReportFeedback({
        status: 'saved',
        message: 'Reporte financiero guardado con todos sus parámetros en Firebase.',
      });
      setTimeout(() => setReportFeedback(null), 4500);
    } catch (err) {
      console.error('Error guardando reporte financiero:', err);
      const message =
        err instanceof Error && err.message.includes('permission')
          ? 'Permiso denegado o validación rechazada al guardar el reporte en Firebase.'
          : err instanceof Error
            ? `No se pudo guardar el reporte financiero: ${err.message}`
            : 'No se pudo guardar el reporte financiero en Firebase.';
      setReportFeedback({ status: 'error', message });
    } finally {
      setSavingReport(false);
    }
  };

  const handleSaveStressReport = async (
    payload: StressReportSavePayload,
  ): Promise<SaveReportActionResult> => {
    if (!user) {
      handleSignIn();
      return {
        status: 'error',
        message: 'Debes iniciar sesión con Google para guardar reportes en Firebase.',
      };
    }

    const { scenarioId, scenario, output, targetAnalytics, targetPortfolioName, targetSector } = payload;
    const cleanName = targetPortfolioName.trim().slice(0, 100) || 'Portafolio Mix';
    const boundedAssets = targetAnalytics.assets.slice(0, 12);
    const boundedTickers = boundedAssets.map((a) => a.symbol.slice(0, 16));
    const boundedWeights = boundedAssets.map((a) => Number(a.weight.toFixed(4)));
    const safeCap = Math.min(1000000000, Math.max(0, Math.round(Number(portfolioValue) || 0)));

    const canonicalKey = JSON.stringify({
      type: 'stress_test',
      portfolioName: cleanName,
      sector: targetSector,
      tickers: boundedTickers,
      weights: boundedWeights,
      scenarioId,
      scenarioName: scenario.name,
      marketShockPct: scenario.marketShockPct,
      volMultiplier: Number(scenario.volMultiplier.toFixed(2)),
      correlationTarget: Number(scenario.correlationTarget.toFixed(2)),
      rateShiftBps: scenario.rateShiftBps,
      range,
    });
    const reportFingerprint = buildReportFingerprint(canonicalKey);

    if (savedReports.some((r) => r.reportFingerprint === reportFingerprint || r.id === reportFingerprint)) {
      return {
        status: 'duplicate',
        message:
          'Ya existe un reporte de estrés idéntico guardado para esta cartera y estos parámetros.',
      };
    }

    try {
      const impactBySymbol = new Map(output.assetImpacts.map((imp) => [imp.symbol, imp]));
      const assetDetails: SavedReportAssetDetail[] = boundedAssets.map((a) => {
        const imp = impactBySymbol.get(a.symbol);
        return {
          symbol: a.symbol.slice(0, 16),
          name: a.name.slice(0, 100),
          weight: Number(a.weight.toFixed(6)),
          expectedReturn: Number(a.expectedReturn.toFixed(6)),
          volatility: Number((imp?.stressedVol ?? a.standardDeviation).toFixed(6)),
          sharpe: Number(a.sharpeRatio.toFixed(4)),
          projectedLossPct: Number((imp?.projectedLossPct ?? 0).toFixed(2)),
          riskContributionPct: Number((imp?.riskContributionPct ?? a.componentRiskPct).toFixed(2)),
        };
      });

      await setDoc(doc(db, 'users', user.uid, 'reports', reportFingerprint), {
        ownerId: user.uid,
        reportType: 'stress_test',
        reportFingerprint,
        portfolioName: cleanName,
        sector: targetSector,
        portfolioValue: safeCap,
        tickers: boundedTickers,
        weights: boundedWeights,
        assetDetails,
        modelParams: buildModelParamsSnapshot(targetAnalytics),
        stressParams: {
          scenarioId,
          scenarioName: scenario.name.slice(0, 100),
          marketShockPct: scenario.marketShockPct,
          volMultiplier: Math.min(10, Math.max(0.1, scenario.volMultiplier)),
          correlationTarget: scenario.correlationTarget,
          rateShiftBps: scenario.rateShiftBps,
          drawdownMethodology: output.drawdownMethodology,
        },
        metrics: {
          expectedReturn: Number(output.stressedReturn.toFixed(6)),
          volatility: Math.max(0, Number(output.stressedVolatility.toFixed(6))),
          weightedVariance: Math.max(0, Number(output.stressedWeightedVariance.toFixed(6))),
          sharpeRatio: Number(output.stressedSharpe.toFixed(4)),
          var95: Number(output.var95.toFixed(6)),
          cvar95: Number(output.cvar95.toFixed(6)),
          estimatedDrawdownPct: Number(output.estimatedDrawdownPct.toFixed(2)),
          baselineReturn: Number(output.baselineReturn.toFixed(6)),
          baselineVolatility: Number(output.baselineVolatility.toFixed(6)),
          baselineSharpe: Number(output.baselineSharpe.toFixed(4)),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        status: 'saved',
        message: 'Reporte de estrés guardado con parámetros completos en Firebase.',
      };
    } catch (err) {
      console.error('Error guardando reporte de estrés:', err);
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.includes('permission') || rawMsg.includes('PERMISSION_DENIED')) {
        return {
          status: 'duplicate',
          message:
            'No se pudo guardar: el reporte ya existe (duplicado bloqueado) o no cuentas con permisos de escritura.',
        };
      }
      return {
        status: 'error',
        message: rawMsg
          ? `No se pudo guardar el reporte de estrés: ${rawMsg}`
          : 'Error de red o permisos al guardar el reporte en Firebase.',
      };
    }
  };

  const handleLoadSavedPortfolio = (saved: SavedPortfolioDoc) => {
    setSelectedSector(saved.sector);
    setPortfolioName(saved.name);
    setTickers(saved.tickers);
    const map: Record<string, number> = {};
    saved.tickers.forEach((t, i) => {
      map[t] = saved.weights[i] ?? 1 / saved.tickers.length;
    });
    setCustomWeightsMap(map);
    setObjective('custom');
    setActiveTab('dashboard');
    setDashboardStep(3);
  };

  const handleRunStressOnPortfolio = (saved: SavedPortfolioDoc) => {
    setStressPreselectPortfolioId(saved.id);
    setActiveTab('stress');
  };

  const handleDeleteReport = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'reports', id));
    } catch (err) {
      console.error('Error eliminando reporte:', err);
      throw new Error('No se pudo eliminar el reporte en Firebase. Verifica tu conexión.');
    }
  };

  const handleDeletePortfolio = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'portfolios', id));
    } catch (err) {
      console.error('Error eliminando portafolio:', err);
      throw new Error('No se pudo eliminar la cartera en Firebase. Verifica tu conexión.');
    }
  };

  const handleDeleteStressTest = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'stressTests', id));
    } catch (err) {
      console.error('Error eliminando prueba de estrés:', err);
      throw new Error('No se pudo eliminar la simulación en Firebase.');
    }
  };

  const handleUpdateProfileSettings = async (roleLabel: string, defaultCapital: number) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        roleLabel,
        defaultCapital,
        updatedAt: serverTimestamp(),
      });
      setPortfolioValue(defaultCapital);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleExportCSV = () => {
    if (!analytics) return;
    const rows = [
      ['Portafolio', portfolioName],
      ['Capital (USD)', String(portfolioValue)],
      ['Rendimiento Esperado Anual (%)', (analytics.portfolioExpectedReturn * 100).toFixed(2)],
      ['Volatilidad Anual (%)', (analytics.standardDeviation * 100).toFixed(2)],
      ['Varianza Ponderada (%^2)', (analytics.weightedVariance * 100).toFixed(4)],
      ['Sharpe Ratio', analytics.sharpeRatio.toFixed(3)],
      ['Tasa Libre de Riesgo (%)', (analytics.riskFreeRate * 100).toFixed(2)],
      [],
      ['Ticker', 'Empresa', 'Precio Actual (USD)', 'Retorno Anual (%)', 'Volatilidad (%)', 'Peso Optimo (%)', 'Monto Asignado (USD)'],
      ...analytics.assets.map((a) => [
        a.symbol,
        `"${a.name.replace(/"/g, '')}"`,
        a.price.toFixed(2),
        (a.expectedReturn * 100).toFixed(2),
        (a.standardDeviation * 100).toFixed(2),
        (a.weight * 100).toFixed(2),
        (a.weight * portfolioValue).toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PortfolioMixAI_${portfolioName.replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-sm text-slate-300">
        Verificando sesión...
      </div>
    );
  }

  if (!user && !guestMode) {
    return (
      <LoginScreen
        authLoading={authLoading}
        authError={authError}
        onSignIn={handleSignIn}
        onDismissError={() => setAuthError(null)}
        onExploreGuest={() => {
          setGuestMode(true);
          setPortfolioValue(0);
          setTickers([]);
          setShowOnboardingModal(true);
        }}
      />
    );
  }

  const displayShortName = user
    ? formatShortName(user.displayName, user.email)
    : 'Modo Invitado';
  const displayRole = user ? userProfile?.roleLabel || 'Estudiante' : 'Exploración';
  const displayInitials = user ? getInitials(user.displayName, user.email) : 'PM';
  const riskSliderValue =
    riskPreference === 'conservador' ? 0 : riskPreference === 'moderado' ? 1 : 2;

  const showGeminiPanel =
    activeTab === 'dashboard' ||
    activeTab === 'predictions' ||
    activeTab === 'build' ||
    activeTab === 'market' ||
    activeTab === 'stress';

  return (
    <div className="min-h-screen flex bg-[#F4F5FB] dark:bg-[#0B1020] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Left Navigation Sidebar */}
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'dashboard') setDashboardStep(3);
        }}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Right Main Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="px-5 sm:px-7 pt-5 pb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                PortfolioMix <span className="text-[#635BFF]">AI</span>
              </h1>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Optimiza tus inversiones con modelos cuantitativos e inteligencia artificial.
              </p>
            </div>
          </div>

          {/* Theme Switcher + Account Profile */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Light / Dark Mode Switch */}
            <div
              role="group"
              aria-label="Cambiar tema claro u oscuro"
              className="inline-flex items-center p-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs"
            >
              <button
                type="button"
                onClick={() => setDarkMode(false)}
                aria-label="Tema claro"
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  !darkMode
                    ? 'bg-slate-100 text-amber-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDarkMode(true)}
                aria-label="Tema oscuro"
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  darkMode
                    ? 'bg-slate-800 text-indigo-300'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Moon className="w-4 h-4" />
              </button>
            </div>

            {/* User Account Pill */}
            <div className="relative">
              {user ? (
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={displayShortName}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#312E81] text-white text-xs font-bold flex items-center justify-center">
                      {displayInitials}
                    </div>
                  )}
                  <div className="hidden sm:block text-left leading-tight">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {displayShortName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {displayRole}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={authLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>{authLoading ? 'Conectando...' : 'Acceder con Google'}</span>
                </button>
              )}

              {profileMenuOpen && user && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-1.5 z-40 text-xs">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {user.displayName}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 truncate">
                      {user.email}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('account');
                      setProfileMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Mi Cuenta y Preferencias
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('history');
                      setProfileMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Reportes Guardados ({savedReports.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-medium cursor-pointer"
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Workspace + Right Gemini Panel */}
        <div className="flex-1 px-5 sm:px-7 pb-8 flex flex-col xl:flex-row gap-5 items-stretch">
          {/* Center Column */}
          <main className="flex-1 min-w-0 space-y-4">
            {/* Dashboard View */}
            {activeTab === 'dashboard' && (
              <>
                {/* Stepper + Export Row */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 sm:gap-5 overflow-x-auto py-1">
                    {(
                      [
                        { step: 1 as const, label: 'Activos' },
                        { step: 2 as const, label: 'Parámetros' },
                        { step: 3 as const, label: 'Resultados' },
                      ]
                    ).map((s, idx) => {
                      const isActive = dashboardStep === s.step;
                      return (
                        <div key={s.step} className="flex items-center gap-2 sm:gap-4 shrink-0">
                          <button
                            type="button"
                            onClick={() => setDashboardStep(s.step)}
                            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                              isActive
                                ? 'bg-[#ECEAFE] dark:bg-indigo-950/70 text-[#4F46E5] dark:text-indigo-300'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                                isActive
                                  ? 'bg-[#635BFF] text-white'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {s.step}
                            </span>
                            <span>{s.label}</span>
                          </button>
                          {idx < 2 && (
                            <span className="hidden sm:block w-8 h-px bg-slate-200 dark:bg-slate-800" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveCurrentPortfolio}
                      disabled={!analytics || savingPortfolio}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {savedNotice ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Cartera guardada</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>Guardar cartera</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveFinancialReport}
                      disabled={!analytics || savingReport}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#635BFF] hover:bg-[#5243E5] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{savingReport ? 'Guardando...' : 'Guardar Reporte'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportCSV}
                      disabled={!analytics}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Exportar</span>
                    </button>
                  </div>
                </div>

                {/* Financial Report Save Feedback */}
                {reportFeedback && (
                  <div
                    role="status"
                    className={`rounded-xl px-4 py-2.5 border flex items-center justify-between gap-2 text-xs ${
                      reportFeedback.status === 'saved'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : reportFeedback.status === 'duplicate'
                          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                          : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {reportFeedback.status === 'saved' ? (
                        <Check className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      )}
                      <span>{reportFeedback.message}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReportFeedback(null)}
                      className="underline font-semibold cursor-pointer"
                    >
                      Cerrar
                    </button>
                  </div>
                )}

                {/* Error Alert if Market Fetch Fails */}
                {marketError && (
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-3 flex items-center justify-between text-xs text-rose-800 dark:text-rose-200">
                    <span>{marketError}</span>
                    <button
                      type="button"
                      onClick={() => setRefreshNonce((n) => n + 1)}
                      className="font-semibold underline cursor-pointer"
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                {/* Step 1: Inline Asset Selector */}
                {dashboardStep === 1 && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          Paso 1: Selección de Activos y Sectores
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Elige un mandato sectorial o busca cualquier símbolo en Yahoo Finance.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDashboardStep(2)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Continuar a Parámetros
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {SECTOR_PRESETS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectSector(s.id)}
                          className={`text-left p-3 rounded-xl border text-xs transition-colors cursor-pointer ${
                            selectedSector === s.id
                              ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div className="font-semibold">{s.name}</div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1 truncate">
                            {s.tickers.join(' · ')}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {tickers.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-semibold"
                        >
                          <span>{t}</span>
                          {tickers.length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTicker(t)}
                              aria-label={`Quitar ${t}`}
                              className="hover:text-rose-600 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="relative max-w-md">
                      <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800">
                        <Search className="w-4 h-4 text-slate-400 mr-2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Buscar acción o ETF en Yahoo Finance (ej. AMZN, SPY)..."
                          className="w-full bg-transparent text-xs text-slate-900 dark:text-white focus:outline-none"
                        />
                      </div>
                      {(searchResults.length > 0 || searching) && (
                        <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-30 max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                          {searching && (
                            <div className="p-3 text-xs text-slate-500">Buscando...</div>
                          )}
                          {searchResults.map((item) => (
                            <button
                              key={item.symbol}
                              type="button"
                              onClick={() => handleAddTicker(item.symbol)}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs cursor-pointer"
                            >
                              <div>
                                <span className="font-mono font-semibold">{item.symbol}</span>
                                <span className="ml-2 text-slate-500">{item.shortname}</span>
                              </div>
                              <Plus className="w-3.5 h-3.5 text-indigo-600" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2: Parameters */}
                {dashboardStep === 2 && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          Paso 2: Parámetros Cuantitativos del Portafolio
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Define el capital invertido, horizonte histórico de Yahoo Finance y perfil
                          de riesgo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDashboardStep(3)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Ver Resultados
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div className="space-y-1.5">
                        <label className="font-medium text-slate-700 dark:text-slate-300">
                          Nombre del Portafolio
                        </label>
                        <input
                          type="text"
                          value={portfolioName}
                          maxLength={100}
                          onChange={(e) => setPortfolioName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-medium text-slate-700 dark:text-slate-300">
                          Valor del Portafolio (USD)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={1000000000}
                          step="any"
                          value={portfolioValue}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            setPortfolioValue(
                              Number.isFinite(raw) ? Math.min(1000000000, Math.max(0, raw)) : 0,
                            );
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-medium text-slate-700 dark:text-slate-300">
                          Ventana Histórica
                        </label>
                        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                          {(['3mo', '6mo', '1y', '2y'] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setRange(r)}
                              className={`py-1.5 rounded-lg font-mono font-semibold cursor-pointer ${
                                range === r
                                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {r.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Results Dashboard (Exact Reference Layout) */}
                {dashboardStep === 3 && (
                  <>
                    {/* 4 KPI Cards Row */}
                    {loadingMarket && !analytics ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-24 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 animate-pulse"
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        {/* KPI 1: Rendimiento esperado */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
                          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
                            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              Rendimiento esperado
                            </div>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                              <span
                                className={`text-2xl font-bold font-mono tabular-nums ${
                                  !analytics
                                    ? 'text-slate-400 dark:text-slate-500'
                                    : analytics.portfolioExpectedReturn >= 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {analytics
                                  ? `${(analytics.portfolioExpectedReturn * 100).toFixed(1)}%`
                                  : '0.0%'}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                Anual
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* KPI 2: Volatilidad (Riesgo) */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
                          <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center shrink-0">
                            <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              Volatilidad (Riesgo)
                            </div>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                              <span
                                className={`text-2xl font-bold font-mono tabular-nums ${
                                  analytics
                                    ? 'text-[#5B4CE6] dark:text-indigo-400'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                {analytics
                                  ? `${(analytics.standardDeviation * 100).toFixed(1)}%`
                                  : '0.0%'}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                Anual
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* KPI 3: Sharpe Ratio */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
                          <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-950/60 flex items-center justify-center shrink-0">
                            <Scale className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              Sharpe Ratio
                            </div>
                            <div
                              className={`mt-0.5 text-2xl font-bold font-mono tabular-nums ${
                                analytics
                                  ? 'text-slate-900 dark:text-white'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {analytics ? analytics.sharpeRatio.toFixed(2) : '0.00'}
                            </div>
                          </div>
                        </div>

                        {/* KPI 4: Valor del portafolio */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
                          <div className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center shrink-0">
                            <Coins className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              Valor del portafolio
                            </div>
                            <div className="mt-0.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                              ${Math.round(portfolioValue).toLocaleString('en-US')}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Empty State when user hasn't registered assets yet */}
                    {!loadingMarket && !analytics && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/60 dark:border-indigo-800 flex items-center justify-center mx-auto">
                          <Coins className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="space-y-1.5 max-w-md mx-auto">
                          <h2 className="text-base font-bold text-slate-900 dark:text-white">
                            Tu portafolio inicial está en ${Math.round(portfolioValue).toLocaleString('en-US')} sin activos seleccionados
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Registra el capital de tu portafolio y selecciona al menos 2 activos
                            reales de Yahoo Finance para calcular la frontera de Markowitz, Random
                            Forest, matriz de Pearson y análisis de Gemini.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowOnboardingModal(true)}
                            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Registrar valor y activos
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('build')}
                            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                          >
                            Ir a Construir Portafolio
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Middle Row: Donut + Markowitz Frontier */}
                    {analytics && frontier && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                        <div className="lg:col-span-4">
                          <DistributionDonut
                            assets={analytics.assets}
                            portfolioValue={portfolioValue}
                          />
                        </div>
                        <div className="lg:col-span-8">
                          <MarkowitzChart frontier={frontier} />
                        </div>
                      </div>
                    )}

                    {/* Controls Bar: Preferencia de riesgo & Objetivo de optimización */}
                    {analytics && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-5 items-center shadow-[0_2px_10px_-3px_rgba(15,23,42,0.05)]">
                        {/* Left: Preferencia de riesgo */}
                        <div className="md:col-span-6 space-y-2.5 md:pr-5 md:border-r md:border-slate-100 dark:md:border-slate-800">
                          <div className="relative flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              Preferencia de riesgo
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowRiskTooltip((v) => !v)}
                              className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                              aria-label="Detalle preferencia de riesgo"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                            {showRiskTooltip && (
                              <div className="absolute left-0 top-6 z-20 w-64 p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md text-[11px] text-slate-600 dark:text-slate-300">
                                Modula la mezcla entre Mínima Varianza, Random Forest y Máximo
                                Sharpe según tu tolerancia a caídas.
                              </div>
                            )}
                          </div>

                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={1}
                            value={riskSliderValue}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setObjective('maxSharpe');
                              setCustomWeightsMap(null);
                              setRiskPreference(
                                v === 0 ? 'conservador' : v === 1 ? 'moderado' : 'agresivo',
                              );
                            }}
                            aria-label="Preferencia de riesgo"
                            className="w-full accent-[#635BFF] cursor-pointer h-1.5"
                          />

                          <div className="flex items-center justify-between text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setRiskPreference('conservador');
                                setObjective('maxSharpe');
                                setCustomWeightsMap(null);
                              }}
                              className={`cursor-pointer ${
                                riskPreference === 'conservador'
                                  ? 'font-semibold text-[#635BFF]'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              Conservador
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRiskPreference('moderado');
                                setObjective('maxSharpe');
                                setCustomWeightsMap(null);
                              }}
                              className={`cursor-pointer ${
                                riskPreference === 'moderado'
                                  ? 'font-semibold text-[#635BFF]'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              Moderado
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRiskPreference('agresivo');
                                setObjective('maxSharpe');
                                setCustomWeightsMap(null);
                              }}
                              className={`cursor-pointer ${
                                riskPreference === 'agresivo'
                                  ? 'font-semibold text-[#635BFF]'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              Agresivo
                            </button>
                          </div>
                        </div>

                        {/* Right: Objetivo de optimización */}
                        <div className="md:col-span-6 space-y-2.5">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Objetivo de optimización
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setObjective('maxSharpe');
                                setCustomWeightsMap(null);
                              }}
                              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                                objective === 'maxSharpe'
                                  ? 'bg-[#ECEAFE] dark:bg-indigo-950/70 border-indigo-400/60 text-[#4F46E5] dark:text-indigo-300'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <Crown className="w-3.5 h-3.5 shrink-0" />
                              <span>Max Sharpe</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setObjective('minRisk');
                                setCustomWeightsMap(null);
                              }}
                              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                                objective === 'minRisk'
                                  ? 'bg-[#ECEAFE] dark:bg-indigo-950/70 border-indigo-400/60 text-[#4F46E5] dark:text-indigo-300'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <Shield className="w-3.5 h-3.5 shrink-0" />
                              <span>Mínimo riesgo</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setObjective('custom')}
                              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                                objective === 'custom'
                                  ? 'bg-[#ECEAFE] dark:bg-indigo-950/70 border-indigo-400/60 text-[#4F46E5] dark:text-indigo-300'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                              <span>Personalizado</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bottom Table: Activos seleccionados */}
                    {analytics && (
                      <SelectedAssetsTable
                        assets={analytics.assets}
                        objective={objective}
                        onUpdateWeight={handleUpdateCustomWeight}
                      />
                    )}
                  </>
                )}
              </>
            )}

            {/* Predicciones Multi-Plazo View */}
            {activeTab === 'predictions' && (
              <PortfolioPredictionView
                analytics={analytics}
                loadingMarket={loadingMarket}
                portfolioName={portfolioName}
                portfolioValue={portfolioValue}
                onOpenOnboarding={() => setShowOnboardingModal(true)}
                onNavigateBuild={() => setActiveTab('build')}
              />
            )}

            {/* Construir Portafolio View */}
            {activeTab === 'build' && (
              <div className="space-y-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        Construir Portafolio Sectorial o Personalizado
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Combina sectores reales (Tecnología, Consumo, Biotecnología, Minería,
                        Banca) o añade cualquier ticker desde Yahoo Finance.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRefreshNonce((n) => n + 1)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingMarket ? 'animate-spin' : ''}`} />
                        <span>Actualizar</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCurrentPortfolio}
                        disabled={!analytics || savingPortfolio}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>{savedNotice ? 'Guardado en Firestore' : 'Guardar en Mi Cuenta'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Sector Preset Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {SECTOR_PRESETS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectSector(s.id)}
                        className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                          selectedSector === s.id
                            ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {s.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {s.subtitle}
                        </div>
                        <div className="mt-2.5 text-[11px] font-mono text-indigo-700 dark:text-indigo-300">
                          {s.tickers.join(' · ')}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Capital + Name + Ticker Builder */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="space-y-1.5 text-xs">
                      <label className="font-medium text-slate-700 dark:text-slate-300">
                        Nombre del Portafolio
                      </label>
                      <input
                        type="text"
                        value={portfolioName}
                        maxLength={100}
                        onChange={(e) => setPortfolioName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <label className="font-medium text-slate-700 dark:text-slate-300">
                        Capital Invertido (USD)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={1000000000}
                        step="any"
                        value={portfolioValue}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          setPortfolioValue(
                            Number.isFinite(raw) ? Math.min(1000000000, Math.max(0, raw)) : 0,
                          );
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5 text-xs relative">
                      <label className="font-medium text-slate-700 dark:text-slate-300">
                        Añadir Ticker (Yahoo Finance)
                      </label>
                      <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800">
                        <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Ej. TSLA, GOOGL, GLD..."
                          className="w-full bg-transparent text-slate-900 dark:text-white focus:outline-none"
                        />
                      </div>
                      {(searchResults.length > 0 || searching) && (
                        <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-30 max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                          {searchResults.map((item) => (
                            <button
                              key={item.symbol}
                              type="button"
                              onClick={() => handleAddTicker(item.symbol)}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs cursor-pointer"
                            >
                              <div>
                                <span className="font-mono font-semibold">{item.symbol}</span>
                                <span className="ml-2 text-slate-500">{item.shortname}</span>
                              </div>
                              <Plus className="w-3.5 h-3.5 text-indigo-600" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      {tickers.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-semibold"
                        >
                          <span>{t}</span>
                          {tickers.length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTicker(t)}
                              aria-label={`Eliminar ${t}`}
                              className="hover:text-rose-600 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('dashboard');
                        setDashboardStep(3);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Ir a Resultados Markowitz
                    </button>
                  </div>
                </div>

                {analytics && (
                  <SelectedAssetsTable
                    assets={analytics.assets}
                    objective="custom"
                    onUpdateWeight={handleUpdateCustomWeight}
                  />
                )}
              </div>
            )}

            {/* Análisis de Mercado View (Random Forest, Pearson, Volatility Sort, Stress Tests) */}
            {activeTab === 'market' &&
              (analytics ? (
                <div className="space-y-6">
                  <RandomForestPanel
                    analytics={analytics}
                    weightMode={objective === 'custom' ? 'custom' : 'rf'}
                    onApplyPresetWeights={(mode) => handleApplyPresetFromPanel(mode)}
                    onUpdateCustomWeight={handleUpdateCustomWeight}
                  />
                  <PearsonMatrixPanel analytics={analytics} />
                  <VolatilitySortPanel
                    analytics={analytics}
                    onApplyInverseVolatility={() => handleApplyPresetFromPanel('invVol')}
                  />
                  <StressTestLab
                    analytics={analytics}
                    sectorId={selectedSector}
                    portfolioName={portfolioName}
                    portfolioValue={portfolioValue}
                    range={range}
                    savedPortfolios={savedPortfolios}
                    isAuthenticated={Boolean(user)}
                    onRequireAuth={handleSignIn}
                    onSaveStressReport={handleSaveStressReport}
                  />
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Análisis de Mercado sin activos activos
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    Registra tu capital y al menos 2 activos para ejecutar Random Forest, matriz de
                    Pearson, sorteo de volatilidad y pruebas de estrés.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowOnboardingModal(true)}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Registrar valor y activos
                  </button>
                </div>
              ))}

            {/* Dedicated Pruebas de Estrés View */}
            {activeTab === 'stress' && (
              <StressTestLab
                analytics={analytics}
                sectorId={selectedSector}
                portfolioName={portfolioName}
                portfolioValue={portfolioValue}
                range={range}
                savedPortfolios={savedPortfolios}
                preselectedPortfolioId={stressPreselectPortfolioId}
                isAuthenticated={Boolean(user)}
                onRequireAuth={handleSignIn}
                onSaveStressReport={handleSaveStressReport}
              />
            )}

            {/* Reportes Guardados View */}
            {activeTab === 'history' && (
              <HistoryView
                user={user}
                reports={savedReports}
                portfolios={savedPortfolios}
                stressTests={savedStressTests}
                onSignIn={handleSignIn}
                onLoadPortfolio={handleLoadSavedPortfolio}
                onRunStressOnPortfolio={handleRunStressOnPortfolio}
                onDeleteReport={handleDeleteReport}
                onDeletePortfolio={handleDeletePortfolio}
                onDeleteStressTest={handleDeleteStressTest}
              />
            )}

            {/* Mi Cuenta View */}
            {activeTab === 'account' && (
              <AccountView
                user={user}
                profile={userProfile}
                portfoliosCount={savedPortfolios.length}
                stressTestsCount={savedReports.length + savedStressTests.length}
                onSignIn={handleSignIn}
                onSignOut={handleSignOut}
                onUpdateProfileSettings={handleUpdateProfileSettings}
              />
            )}
          </main>

          {/* Right Gemini AI Advisor Sidebar */}
          {showGeminiPanel && (
            <GeminiAdvisorPanel
              analytics={analytics}
              frontier={frontier}
              currentAppTab={activeTab}
              portfolioName={portfolioName}
              portfolioValue={portfolioValue}
              userName={displayShortName}
              riskPreference={riskPreference}
              objective={objective}
              onApplyPresetMode={(mode) => handleApplyPresetFromPanel(mode)}
            />
          )}
        </div>
      </div>

      {/* Onboarding Pop-up for new / empty accounts */}
      <PortfolioOnboardingModal
        open={showOnboardingModal}
        userName={displayShortName}
        initialCapital={portfolioValue}
        initialTickers={tickers}
        onClose={() => setShowOnboardingModal(false)}
        onComplete={handleCompleteOnboarding}
      />
    </div>
  );
}
