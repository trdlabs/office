import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext';
import { loginOperator, LoginError } from '../session/login';
import { CityScene } from '../city/CityScene';
import { LoginModal } from './LoginModal';

const FLOOR_PATH = '/floor/trading-lab';

export function OutsideScreen() {
  const navigate = useNavigate();
  const { session, login } = useSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connected = (import.meta.env.VITE_OFFICE_MODE ?? 'mock') === 'connected';
  const baseUrl = import.meta.env.VITE_OFFICE_GATEWAY_URL ?? 'http://localhost:8787';

  function handleDoor() {
    if (session.user) {
      navigate(FLOOR_PATH);
    } else {
      setError(null);
      setLoginOpen(true);
    }
  }

  async function handleLogin(name: string, password: string) {
    // Open / mock mode: no server to verify against — proceed cosmetically.
    if (!connected) {
      login(name);
      setLoginOpen(false);
      navigate(FLOOR_PATH);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token } = await loginOperator(baseUrl, password);
      login(name, token);
      setLoginOpen(false);
      navigate(FLOOR_PATH);
    } catch (e) {
      setError(
        e instanceof LoginError
          ? 'Incorrect password. Try again.'
          : 'Sign-in failed — is the office server reachable?',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="outside">
      <CityScene
        mood="day"
        onEnter={handleDoor}
        doorLabel={session.user ? 'Enter the Trading Lab floor' : 'Knock on the tower door to sign in'}
      />
      <p className="outside__caption">
        {session.user ? 'Welcome back — step through the door.' : 'Click the tower door to sign in.'}
      </p>
      {loginOpen && (
        <LoginModal
          onSubmit={handleLogin}
          onCancel={() => {
            setLoginOpen(false);
            setError(null);
          }}
          error={error}
          busy={busy}
          hint={connected ? 'Enter the operator password to sign in.' : 'Open mode — any value works.'}
        />
      )}
    </div>
  );
}
