import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext';
import { LoginModal } from './LoginModal';

const FLOOR_PATH = '/floor/trading-lab';

export function OutsideScreen() {
  const navigate = useNavigate();
  const { session, login } = useSession();
  const [loginOpen, setLoginOpen] = useState(false);

  function handleDoor() {
    if (session.user) {
      navigate(FLOOR_PATH);
    } else {
      setLoginOpen(true);
    }
  }

  function handleLogin(name: string) {
    login(name);
    setLoginOpen(false);
    navigate(FLOOR_PATH);
  }

  return (
    <div className="outside">
      <div className="outside__scene">
        <svg
          className="outside__facade"
          viewBox="0 0 200 160"
          preserveAspectRatio="xMidYMax meet"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <rect x="0" y="0" width="200" height="160" fill="#7fa9d6" />
          <rect x="0" y="120" width="200" height="40" fill="#3c4a3a" />
          <rect x="34" y="20" width="132" height="108" fill="#3b4358" />
          <rect x="34" y="20" width="132" height="108" fill="none" stroke="#23283a" strokeWidth="2" />
          {Array.from({ length: 4 }).flatMap((_, row) =>
            Array.from({ length: 5 }).map((__, col) => (
              <rect
                key={`${row}-${col}`}
                x={44 + col * 24}
                y={28 + row * 20}
                width="14"
                height="12"
                fill={(row + col) % 3 === 0 ? '#ffd27f' : '#9fb6d8'}
              />
            )),
          )}
          <rect x="86" y="104" width="28" height="24" fill="#5a3b22" />
          <rect x="86" y="104" width="28" height="24" fill="none" stroke="#2f1d10" strokeWidth="2" />
          <text x="100" y="16" textAnchor="middle" fontSize="9" fill="#1d2233" fontFamily="monospace">
            TRADING LAB
          </text>
        </svg>
        <button
          type="button"
          className="outside__door"
          onClick={handleDoor}
          aria-label={session.user ? 'Enter the Trading Lab floor' : 'Knock to sign in'}
        >
          <span className="outside__door-hint">
            {session.user ? 'Enter →' : 'Knock'}
          </span>
        </button>
      </div>
      <p className="outside__caption">Click the door to enter.</p>
      {loginOpen && (
        <LoginModal onSubmit={handleLogin} onCancel={() => setLoginOpen(false)} />
      )}
    </div>
  );
}
