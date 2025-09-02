import { useState, useCallback } from 'react'
import { createFileRoute } from "@tanstack/react-router"

import TerminalWindow from '../components/TerminalWindow'
import TerminalView from '../components/TerminalView'

export const Route = createFileRoute('/$scenario')({
  component: ScenarioRoute
})

function ScenarioRoute() {
  const { scenario } = Route.useParams()

  console.log(`The scenario is: ${scenario}`)

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
  const closeTerminalWindow = useCallback(
    () => {
      setSession(null);
    },
    []
  );

  const isOpen = !!session

  return (
    <div className="app-container">
      <h1>Chaos Lab</h1>
      <p>The scenario is: {scenario}</p>
      <p>Click the button below to test the pop-out window.</p>

      <button
        onClick={openTerminalWindow}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
        // The button is disabled if a terminal is already open.
        disabled={isOpen}
      >
        Open Terminal Window
      </button>

      {/* The TerminalWindow will only be created and rendered if a session exists */}
      <TerminalWindow isOpen={isOpen} onClose={closeTerminalWindow}>
        <div style={{ padding: '1rem', height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ color: '#ebdbb2', fontFamily: 'monospace', flexShrink: 0 }}>
            Chaos Lab Terminal
          </h2>
          <TerminalView
            sessionId={session?.sessionId}
            websocketPath={session?.websocketPath}
          />
        </div>
      </TerminalWindow>
    </div>
  )
}