import type { FC } from 'react';
import { FileText, X } from 'lucide-react';
import type { ActiveNoteData } from '../game/types';

interface NoteModalProps {
  note: ActiveNoteData;
  onClose: () => void;
}

export const NoteModal: FC<NoteModalProps> = ({ note, onClose }) => {
  return (
    <div
      data-testid="note-modal"
      className="fixed inset-0 z-30 flex items-center justify-center px-6 pointer-events-auto"
      style={{ backgroundColor: 'rgba(5, 6, 9, 0.84)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-modal-title"
    >
      <article className="relative w-full max-w-lg border border-[#b8a98a]/35 bg-[#12110f] p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#b8a98a]/20 pb-4">
          <div className="flex items-center gap-2.5 text-[#c8ba9d]">
            <FileText className="h-4 w-4 shrink-0 text-[#b91c1c]" aria-hidden="true" />
            <span className="text-[11px] font-medium tracking-[0.18em] uppercase">
              {note.roomLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar nota"
            className="cursor-pointer border border-white/10 p-1.5 text-[#a8a298] transition-colors hover:border-white/30 hover:text-[#ece8e0]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <h2
          id="note-modal-title"
          className="mt-5 font-display text-2xl font-bold tracking-[0.08em] text-[#ece6da]"
        >
          {note.title}
        </h2>

        <p
          data-testid="note-modal-text"
          className="mt-4 border-l-2 border-[#b91c1c]/65 bg-[#191714] px-5 py-4 text-[15px] leading-relaxed text-[#dfd8c8]"
        >
          {note.text}
        </p>

        <div className="mt-7 flex items-center justify-between gap-4">
          <span className="text-[11px] tracking-wide text-[#8f887d]">
            Pulsa Esc para continuar
          </span>
          <button
            type="button"
            data-testid="close-note-btn"
            onClick={onClose}
            className="cursor-pointer border border-[#b91c1c] bg-[#8b1818] px-6 py-2.5 text-xs font-semibold tracking-[0.14em] text-[#f5f2eb] uppercase transition-colors hover:bg-[#a61f1f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5e2dc] whitespace-nowrap"
          >
            Cerrar nota
          </button>
        </div>
      </article>
    </div>
  );
};
