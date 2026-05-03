import { useToast } from '../lib/useToast';

export default function Toast() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  const typeStyles: Record<string, React.CSSProperties> = {
    success: { background: 'var(--accent-emerald)', color: '#fff' },
    error: { background: 'var(--accent-red)', color: '#fff' },
    info: { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' },
  };

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      right: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 9999,
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 200,
            ...typeStyles[t.type],
          }}
        >
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            onClick={() => dismissToast(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              opacity: 0.7,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
