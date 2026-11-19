import { useState } from 'react';

const FIREBASE_BG_VIDEO_URL =
  'https://firebasestorage.googleapis.com/v0/b/dazzling-sector-513201-u0.firebasestorage.app/o/download.mp4?alt=media&token=01600297-596f-4d52-8134-dc0d9449397a';

interface LoginScreenProps {
  authLoading: boolean;
  authError: string | null;
  onSignIn: () => void;
  onDismissError: () => void;
  onExploreGuest: () => void;
}

export function LoginScreen({
  authLoading,
  authError,
  onSignIn,
  onDismissError,
  onExploreGuest,
}: LoginScreenProps) {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950 flex items-center justify-center px-6 py-12">
      {/* Silent Looping Background Video from Firebase Storage */}
      {!videoFailed && (
        <video
          src={FIREBASE_BG_VIDEO_URL}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onError={() => setVideoFailed(true)}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}

      {/* Measured contrast scrim */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/45 to-slate-950/75"
      />

      {/* Transparent Auth Container */}
      <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-md border border-white/20 rounded-2xl p-8 sm:p-10 text-white space-y-8">
        <div className="space-y-3 text-center">
          <div className="text-xl font-bold tracking-tight text-white">
            PortfolioMix AI
          </div>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight"
            style={{ textWrap: 'balance' }}
          >
            Optimización de Carteras y Análisis Predictivo de Riesgo
          </h1>
          <p className="text-sm text-slate-200/90 leading-relaxed">
            Random Forest · Frontera Eficiente de Markowitz · Correlación de Pearson · Gemini AI
          </p>
        </div>

        {authError && (
          <div className="bg-rose-950/60 border border-rose-400/40 rounded-xl px-4 py-3 text-xs text-rose-100 flex items-center justify-between gap-3">
            <span>{authError}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="underline font-medium shrink-0 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        <div className="space-y-4">
          <button
            type="button"
            disabled={authLoading}
            onClick={onSignIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-transparent hover:bg-white/15 active:bg-white/20 border border-white/45 hover:border-white/80 backdrop-blur-sm text-sm font-semibold text-white transition-all whitespace-nowrap cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{authLoading ? 'Conectando con Google...' : 'Iniciar sesión con Google'}</span>
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={onExploreGuest}
              className="text-xs text-slate-300 hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
            >
              Continuar sin cuenta en modo exploración
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
