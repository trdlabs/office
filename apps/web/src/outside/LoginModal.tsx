import { useState, type FormEvent } from 'react';

/**
 * The entrance dialog, styled as an in-game "ACCESS TERMINAL". Collects a login
 * name and a password. When the server enforces auth the password is verified
 * server-side; in open/mock mode any value is accepted. The parent decides and
 * surfaces failures via `error`.
 */
export function LoginModal({
  onSubmit,
  onCancel,
  error,
  busy = false,
  hint = 'Enter the operator password to sign in.',
}: {
  onSubmit: (name: string, password: string) => void | Promise<void>;
  onCancel: () => void;
  error?: string | null;
  busy?: boolean;
  hint?: string;
}) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    void onSubmit(name.trim() || 'Operator', password);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="terminal"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to Trading Lab"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        onSubmit={handleSubmit}
      >
        <div className="terminal__bar">
          <span className="terminal__dot" aria-hidden="true" />
          <span className="terminal__dot" aria-hidden="true" />
          <span className="terminal__dot" aria-hidden="true" />
          <span className="terminal__bartitle">ACCESS&nbsp;TERMINAL</span>
        </div>
        <div className="terminal__body">
          <p className="terminal__intro">
            <span className="terminal__prompt">&gt;</span> TRADING&nbsp;LAB · secure entry
            <span className="terminal__caret" aria-hidden="true" />
          </p>

          <label className="terminal__field">
            <span className="terminal__key">LOGIN</span>
            <input
              className="terminal__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="operator"
              autoComplete="username"
              autoFocus
            />
          </label>

          <label className="terminal__field">
            <span className="terminal__key">PASSWORD</span>
            <input
              className="terminal__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>

          <p className="terminal__hint">{hint}</p>

          {error && (
            <p className="terminal__error" role="alert">
              <span className="terminal__prompt">!</span> {error}
            </p>
          )}

          <div className="terminal__actions">
            <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Enter ▸'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
