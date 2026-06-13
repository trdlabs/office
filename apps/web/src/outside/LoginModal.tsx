import { useState, type FormEvent } from 'react';

export function LoginModal({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(name);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="modal login"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        onSubmit={handleSubmit}
      >
        <h2 className="login__title">Trading Lab</h2>
        <p className="login__hint">Mock sign-in — no real auth in Phase 1.</p>
        <input
          className="login__input"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className="login__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Enter the Lab
          </button>
        </div>
      </form>
    </div>
  );
}
