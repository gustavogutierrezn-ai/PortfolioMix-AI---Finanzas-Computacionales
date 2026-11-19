import type { SectorPortfolioPreset, StressScenario } from '../types/quant';

export const SECTOR_PRESETS: SectorPortfolioPreset[] = [
  {
    id: 'tecnologia',
    name: 'Tecnología Global',
    subtitle: 'Semiconductores, nube e infraestructura digital',
    description:
      'Cartera concentrada en líderes de software empresarial, cómputo acelerado y ecosistemas de plataforma con alta sensibilidad a tasas reales.',
    tickers: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'GOOGL', 'CRM'],
    benchmarkLabel: 'NASDAQ / Tech Large Cap',
  },
  {
    id: 'consumo',
    name: 'Consumo Defensivo y Retail',
    subtitle: 'Bienes básicos y cadenas de distribución masiva',
    description:
      'Empresas con flujo de caja estable, poder de fijación de precios y menor beta cíclica frente a contracciones macroeconómicas.',
    tickers: ['PG', 'KO', 'COST', 'WMT', 'MCD', 'PEP'],
    benchmarkLabel: 'Consumer Staples & Retail',
  },
  {
    id: 'biotecnologia',
    name: 'Biotecnología y Salud',
    subtitle: 'Terapias biológicas, genómica y biofarma',
    description:
      'Activos con alta dispersión idiosincrática y baja correlación estructural respecto al ciclo bancario tradicional.',
    tickers: ['AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB', 'MRNA'],
    benchmarkLabel: 'Biotech & Life Sciences',
  },
  {
    id: 'mineria',
    name: 'Minería y Materias Primas',
    subtitle: 'Oro, cobre y metales industriales estratégicos',
    description:
      'Cobertura real ante choques de oferta e inflación de materias primas mediante productores globales de metales base y preciosos.',
    tickers: ['NEM', 'FCX', 'BHP', 'RIO', 'SCCO', 'GOLD'],
    benchmarkLabel: 'Global Metals & Mining',
  },
  {
    id: 'bancario',
    name: 'Sector Bancario',
    subtitle: 'Banca comercial, inversión y mercados de capital',
    description:
      'Instituciones financieras sistémicas expuestas a la pendiente de la curva de tasas, márgenes de interés neto y riesgo crediticio.',
    tickers: ['JPM', 'BAC', 'GS', 'MS', 'C', 'WFC'],
    benchmarkLabel: 'Major Money Center Banks',
  },
  {
    id: 'multisector',
    name: 'Mix Diversificado Core',
    subtitle: 'Tecnología, banca institucional y consumo defensivo',
    description:
      'Mandato institucional transversal diseñado para equilibrar crecimiento tecnológico, exposición financiera y estabilidad defensiva con baja correlación de Pearson.',
    tickers: ['AAPL', 'MSFT', 'NVDA', 'JPM', 'KO'],
    benchmarkLabel: 'Cross-Sector Core Mandate',
  },
];

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'crisis_2008',
    name: 'Crisis Financiera Sistémica (2008)',
    description:
      'Simulación académica: contracción severa de liquidez interbancaria, convergencia de correlaciones de Pearson hacia 0.85 y expansión extrema de volatilidad.',
    marketShockPct: -34,
    volMultiplier: 2.35,
    rateShiftBps: -150,
    correlationTarget: 0.85,
    sectorAdjustments: {
      bancario: -16,
      tecnologia: -6,
      consumo: 10,
      biotecnologia: 6,
      mineria: -8,
    },
  },
  {
    id: 'inflacion_2022',
    name: 'Choque Inflacionario y Alza de Tasas (2022)',
    description:
      'Simulación académica: repunte persistente de inflación que fuerza endurecimiento monetario (+300 bps), castigando activos de larga duración.',
    marketShockPct: -18,
    volMultiplier: 1.7,
    rateShiftBps: 300,
    correlationTarget: 0.65,
    sectorAdjustments: {
      tecnologia: -12,
      mineria: 12,
      bancario: 4,
      consumo: -2,
      biotecnologia: -7,
    },
  },
  {
    id: 'pandemia_2020',
    name: 'Choque Pandémico de Liquidez (2020)',
    description:
      'Simulación académica: parada súbita de actividad global y búsqueda de liquidez, favoreciendo biotecnología y consumo básico.',
    marketShockPct: -24,
    volMultiplier: 2.2,
    rateShiftBps: -125,
    correlationTarget: 0.78,
    sectorAdjustments: {
      biotecnologia: 14,
      tecnologia: 6,
      consumo: 4,
      mineria: -12,
      bancario: -14,
    },
  },
  {
    id: 'oferta_materias',
    name: 'Choque de Oferta y Materias Primas',
    description:
      'Simulación académica: restricción estructural en energía y metales estratégicos que impulsa materias primas y presiona márgenes de consumo.',
    marketShockPct: -15,
    volMultiplier: 1.6,
    rateShiftBps: 175,
    correlationTarget: 0.55,
    sectorAdjustments: {
      mineria: 18,
      consumo: -6,
      tecnologia: -5,
      bancario: -2,
      biotecnologia: -3,
    },
  },
  {
    id: 'estres_bancario',
    name: 'Estrés Bancario y Contagio Crediticio',
    description:
      'Simulación académica: deterioro de márgenes de crédito y fuga de depósitos que amplifica el contagio en el sector bancario.',
    marketShockPct: -22,
    volMultiplier: 1.95,
    rateShiftBps: -75,
    correlationTarget: 0.74,
    sectorAdjustments: {
      bancario: -22,
      tecnologia: -3,
      consumo: 5,
      biotecnologia: 4,
      mineria: -4,
    },
  },
  {
    id: 'custom',
    name: 'Escenario Personalizado',
    description:
      'Simulación hipotética configurable libremente mediante choque de mercado, multiplicador de volatilidad, correlación y desplazamiento de tasa.',
    marketShockPct: -20,
    volMultiplier: 1.8,
    rateShiftBps: 100,
    correlationTarget: 0.7,
    sectorAdjustments: {},
  },
];
