import type { FC } from 'react';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onReturnToTitle: () => void;
}

export const PauseModal: FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onReturnToTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center px-6 pointer-events-auto"
      style={{ backgroundColor: 'rgba(5, 6, 9, 0.84)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div className="w-full max-w-sm border border-white/15 bg-[#0d1016] p-8 text-center">
        <h2
          id="pause-title"
          className="font-display text-2xl font-bold tracking-[0.16em] text-[#ece8e0] uppercase"
        >
          Pausa
        </h2>
        <p className="mt-2 text-xs tracking-wide text-[#948e84]">
          Fase 3 · Linterna, notas y llaves
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            className="w-full cursor-pointer border border-[#b91c1c] bg-[#8b1818] px-5 py-3 text-xs font-semibold tracking-[0.14em] text-[#f5f2eb] uppercase transition-colors hover:bg-[#a61f1f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5e2dc] whitespace-nowrap"
          >
            Continuar
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full cursor-pointer border border-white/15 bg-[#151922] px-5 py-3 text-xs font-medium tracking-[0.14em] text-[#e5e2dc] uppercase transition-colors hover:border-white/30 hover:bg-[#1c212c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5e2dc] whitespace-nowrap"
          >
            Reiniciar partida
          </button>
          <button
            type="button"
            onClick={onReturnToTitle}
            className="w-full cursor-pointer border border-white/10 bg-transparent px-5 py-3 text-xs font-medium tracking-[0.14em] text-[#9c968c] uppercase transition-colors hover:border-white/25 hover:text-[#e5e2dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5e2dc] whitespace-nowrap"
          >
            Menú principal
          </button>
        </div>

        <div className="mt-6 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-[#847e74]">
          WASD: Mover · Shift: Correr · F: Linterna · E: Interactuar · Esc / P: Pausa
        </div>
      </div>
    </div>
  );
};
