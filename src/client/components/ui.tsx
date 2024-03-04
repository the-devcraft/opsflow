import { useEffect, useRef, type ReactNode } from 'react';
import { Layers3, Loader2, AlertCircle, ClipboardList, X } from 'lucide-react';
import type { RequestState } from '../../shared/contracts';
import { label } from '../format';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Layers3 size={23} />
      </span>
      opsflow<span className="brand-dot">.</span>
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <Loader2 className="spin" size={20} /> Loading workspace…
    </div>
  );
}

export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error" role="alert">
      <AlertCircle size={18} />
      <span>{error instanceof Error ? error.message : 'Something went wrong.'}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <ClipboardList size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Status({ state }: { state: RequestState }) {
  return (
    <span className={`status status-${state}`}>
      <span />
      {state === 'submitted' ? 'In review' : label(state)}
    </span>
  );
}

export function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]') ??
          [],
      );
    focusables()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const nodes = focusables();
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keyboard);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <header>
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <h2 id="drawer-title">{title}</h2>
          </div>
          <button className="icon-button" aria-label="Close panel" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}
