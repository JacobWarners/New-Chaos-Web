import React, { useState, useCallback } from 'react';
import TerminalWindow from './components/terminal/TerminalWindow';
import TerminalView from './components/terminal/TerminalView';
import './App.css';

function App() {
  const [session, setSession] = useState(null);

  // This function creates a "session" object when the button is clicked.
  // This is the trigger that will cause the pop-out window to render.
  const openTerminalWindow = useCallback(() => {
    setSession({
      sessionId: "test-session",
      websocketPath: "/terminal",
    });
  }, []);

  // This function clears the session, which causes the pop-out window to unmount and close.
  const closeTerminalWindow = useCallback(() => {
    setSession(null);
  }, []);

  return (
    <div className="app-container">
      <h1>Chaos Lab</h1>
      <p>Click the button below to test the pop-out window.</p>

      <button
        onClick={openTerminalWindow}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
        // The button is disabled if a terminal is already open.
        disabled={!!session}
      >
        Open Terminal Window
      </button>

      {/* The TerminalWindow will only be created and rendered if a session exists */}
      {session && (
        <TerminalWindow onClose={closeTerminalWindow}>
          <div style={{ padding: '1rem', height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ color: '#ebdbb2', fontFamily: 'monospace', flexShrink: 0 }}>
              Chaos Lab Terminal
            </h2>
            <TerminalView
              sessionId={session.sessionId}
              websocketPath={session.websocketPath}
            />
          </div>
        </TerminalWindow>
      )}
    </div>
  );
}

export default App;


