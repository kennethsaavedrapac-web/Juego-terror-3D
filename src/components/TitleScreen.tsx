import type { FC } from 'react';

interface TitleScreenProps {
  onStart: () => void;
}

export const TitleScreen: FC<TitleScreenProps> = ({ onStart }) => {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between px-8 py-10 pointer-events-auto"
      style={{
        background:
          'radial-gradient(circle at 50% 45%, rgba(5, 6, 9, 0.14) 0%, rgba(5, 6, 9, 0.56) 62%, rgba(3, 4, 6, 0.86) 100%)',
      }}
    >
      <div className="flex items-center justify-between text-xs tracking-widest text-[#b2aba0]">
        <span>CAPÍTULO I · ALA SUR</span>
      </div>

      <main className="mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* Custom inline SVG emblem: shadowed eye & keyhole silhouette */}
        <svg
          viewBox="0 0 120 56"
          className="mb-5 h-12 w-28 text-[#b91c1c]"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 28C24 11 42 5 60 5C78 5 96 11 110 28C96 45 78 51 60 51C42 51 24 45 10 28Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeOpacity="0.85"
          />
          <circle cx="60" cy="28" r="13" stroke="#e5e2dc" strokeWidth="1.5" strokeOpacity="0.85" />
          <circle cx="60" cy="24" r="4.5" fill="currentColor" />
          <path d="M57 27L55.5 36H64.5L63 27H57Z" fill="currentColor" />
        </svg>

        <h1 className="font-display text-5xl font-bold tracking-[0.14em] text-[#ece8e0] sm:text-6xl text-balance">
          DON&apos;T LOOK BACK
        </h1>

        <p className="mt-4 max-w-md text-sm leading-relaxed text-[#a8a298]">
          Despiertas en un ala clausurada. Explora los pasillos en penumbra y domina
          el entorno antes de que algo comience a seguirte.
        </p>

        <div className="mt-9 flex items-center gap-4">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="cursor-pointer border border-[#b91c1c] bg-[#8b1818] px-8 py-3.5 text-sm font-semibold tracking-[0.16em] text-[#f5f2eb] uppercase transition-colors duration-150 hover:bg-[#a61f1f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e5e2dc] whitespace-nowrap shrink-0"
          >
            Entrar al edificio
          </button>
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs tracking-wide text-[#8f897f]">
        <span>WASD / Flechas Mover</span>
        <span aria-hidden="true">·</span>
        <span>Shift Correr</span>
        <span aria-hidden="true">·</span>
        <span>F Linterna</span>
        <span aria-hidden="true">·</span>
        <span>Clic izquierdo Interactuar</span>
        <span aria-hidden="true">·</span>
        <span>Ratón Mirar</span>
        <span aria-hidden="true">·</span>
        <span>Esc / P Pausa</span>
      </footer>
    </div>
  );
};
