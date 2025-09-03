import { useState, useCallback } from 'react'
import { createFileRoute } from "@tanstack/react-router"

import TerminalWindow from '../components/terminal/TerminalWindow'
import TerminalView from '../components/terminal/TerminalView'

export const Route = createFileRoute('/$scenario')({
  component: ScenarioRoute
})

function ScenarioRoute() {
  const { scenario } = Route.useParams()
  const [session, setSession] = useState(null);

  // This function now simply opens the terminal.
  // The command to run terraform will be sent by TerminalView.
  const openTerminalWindow = useCallback(() => {
    setSession({
      sessionId: "test-session", // A unique ID for the session
      websocketPath: "/terminal",
      // NEW: Tell the terminal component to trigger the terraform run
      shouldRunTerraform: true,
    });
  }, []);

  const closeTerminalWindow = useCallback(() => {
    setSession(null);
  }, []);

  const isOpen = !!session

  return (
    <div className="app-container">
      <h1>Chaos Lab</h1>
      <p>The scenario is: {scenario}</p>
      <p>Click the button below to start the Terraform script and open the terminal.</p>

      <button
        onClick={openTerminalWindow}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
        disabled={isOpen}
      >
        Run Terraform & Open Terminal
      </button>

      {/* The TerminalWindow will only be created and rendered if a session exists */}
      <TerminalWindow isOpen={isOpen} onClose={closeTerminalWindow}>
        <div style={{ padding: '1rem', height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ color: '#ebdbb2', fontFamily: 'monospace', flexShrink: 0 }}>
            Chaos Lab Terminal
          </h2>
          {session && (
            <TerminalView
              sessionId={session.sessionId}
              websocketPath={session.websocketPath}
              shouldRunTerraform={session.shouldRunTerraform}
            />
          )}
        </div>
      </TerminalWindow>
    </div>
  )
}
