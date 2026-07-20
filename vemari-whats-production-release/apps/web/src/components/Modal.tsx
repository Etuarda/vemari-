import { ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose(): void; children: ReactNode }) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button ref={closeButton} className="icon-button" aria-label="Fechar" onClick={onClose}><X aria-hidden="true" size={20} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
