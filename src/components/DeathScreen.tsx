interface DeathScreenProps {
  disableFlashes: boolean;
  onRetry: () => void;
  onMainMenu: () => void;
}

export function DeathScreen({
  disableFlashes,
  onRetry,
  onMainMenu,
}: DeathScreenProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="death-screen-title"
      data-testid="death-screen"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#040406] px-6 text-center select-none"
    >
      {/* Subtle dark crimson atmospheric vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 44%, rgba(56, 8, 10, 0.22) 0%, rgba(10, 5, 7, 0.72) 52%, rgba(2, 2, 4, 0.98) 100%)',
        }}
      />

      {/* Subtle procedural interference scanlines & fine static */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${
          disableFlashes ? 'opacity-[0.07]' : 'animate-[deathStaticShift_0.36s_steps(2)_infinite] opacity-[0.13]'
        }`}
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)',
        }}
      />

      <div className="relative z-10 flex max-w-xl flex-col items-center">
        <div
          aria-hidden="true"
          className="mb-7 h-px w-16 bg-gradient-to-r from-transparent via-[#8f2424]/70 to-transparent animate-[deathReveal_0.8s_ease-out_both]"
        />

        <h1
          id="death-screen-title"
          className="font-display text-3xl font-bold tracking-[0.14em] text-[#ece5de] sm:text-5xl animate-[deathReveal_0.85s_ease-out_0.1s_both]"
        >
          NO DEBISTE ACERCARTE.
        </h1>

        <p className="mt-5 max-w-md text-xs font-medium tracking-[0.22em] text-[#9b948c] uppercase sm:text-sm animate-[deathReveal_0.9s_ease-out_0.35s_both]">
          LA PRÓXIMA VEZ, MANTÉN TU DISTANCIA.
        </p>

        <div className="mt-11 flex w-full max-w-xs flex-col gap-3.5 sm:max-w-sm sm:flex-row sm:justify-center animate-[deathReveal_0.9s_ease-out_0.6s_both]">
          <button
            type="button"
            autoFocus
            data-testid="retry-button"
            onClick={onRetry}
            className="cursor-pointer border border-[#b83232]/70 bg-[#1a090b] px-7 py-3.5 text-xs font-semibold tracking-[0.22em] text-[#f3ece6] uppercase transition-colors hover:border-[#dc4646] hover:bg-[#2a0d10] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dc4646]"
          >
            REINTENTAR
          </button>

          <button
            type="button"
            data-testid="main-menu-button"
            onClick={onMainMenu}
            className="cursor-pointer border border-white/20 bg-white/[0.03] px-7 py-3.5 text-xs font-medium tracking-[0.2em] text-[#b9b2aa] uppercase transition-colors hover:border-white/40 hover:bg-white/[0.08] hover:text-[#ece6df] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            MENÚ PRINCIPAL
          </button>
        </div>
      </div>
    </div>
  );
}
