import { useState, useCallback, useRef, useEffect } from 'react';
import { createFileRoute } from "@tanstack/react-router";
import TerminalWindow from '../components/terminal/TerminalWindow';
import TerminalView from '../components/terminal/TerminalView';
import './ScenarioRoute.css';

export const Route = createFileRoute('/$scenario')({
  component: ScenarioRoute
});

// Helper function to format seconds into MM:SS for the timer display
const formatTime = (seconds) => {
  if (seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

function ScenarioRoute() {
  const { scenario } = Route.useParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [remainingTime, setRemainingTime] = useState(null); // State for the countdown
  const socketRef = useRef(null);
  const terminalDataHandlerRef = useRef(null);
  const ptyBufferRef = useRef([]);
  const timerIntervalRef = useRef(null); // Ref to hold the timer interval

  // Function to send the 'extend time' message
  const handleExtendTime = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log("-> [FE] Sending session_extend message...");
      socketRef.current.send(JSON.stringify({ type: 'session_extend' }));
    }
  };

  // Effect to handle the countdown logic
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    if (remainingTime > 0) {
      timerIntervalRef.current = setInterval(() => {
        setRemainingTime(prevTime => prevTime - 1);
      }, 1000);
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [remainingTime]);

  const setTerminalDataHandler = useCallback((handler) => {
    console.log("TerminalView handler has been", handler ? "REGISTERED." : "UNREGISTERED.");
    terminalDataHandlerRef.current = handler;
    if (handler && ptyBufferRef.current.length > 0) {
      console.log(`[SCENARIO] Flushing ${ptyBufferRef.current.length} buffered PTY messages.`);
      ptyBufferRef.current.forEach(data => handler(data));
      ptyBufferRef.current = [];
    }
  }, []);

  const startConnection = useCallback(() => {
    if (isConnecting || socketRef.current) return;
    setIsConnecting(true);
    setConnectionError(null);
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${socketProtocol}//${window.location.host}/terminal`;
    console.log(`Attempting to connect WebSocket to: ${socketUrl}`);
    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("<- [FE-SOCKET] Connection opened. Sending 'run_terraform'...");
      ws.send(JSON.stringify({ type: 'run_terraform' }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'status' && msg.payload === 'connected') {
        setIsConnecting(false);
        setIsTerminalOpen(true);
      } else if (msg.type === 'pty_output') {
        if (terminalDataHandlerRef.current) {
          terminalDataHandlerRef.current(msg.payload);
        } else {
          ptyBufferRef.current.push(msg.payload);
        }
      } else if (msg.type === 'error') {
        setConnectionError(msg.payload);
        setIsConnecting(false);
        ws.close();
      } else if (msg.type === 'session_status') {
        const status = JSON.parse(msg.payload);
        const expiryDate = new Date(status.ExpiresAt);
        const secondsLeft = Math.round((expiryDate.getTime() - Date.now()) / 1000);
        setRemainingTime(secondsLeft > 0 ? secondsLeft : 0);
        if (status.Message && terminalDataHandlerRef.current) {
          terminalDataHandlerRef.current(status.Message);
        }
      }
    };

    ws.onerror = (error) => {
      console.error("<- [FE-SOCKET] WebSocket error:", error);
      setConnectionError("Failed to connect to the WebSocket server.");
      setIsConnecting(false);
    };

    ws.onclose = () => {
      console.log("<- [FE-SOCKET] Connection closed.");
      if (!isTerminalOpen) {
        setIsConnecting(false);
      }
    };
  }, [isConnecting, isTerminalOpen]);

  const closeTerminalWindow = useCallback(() => {
    setIsTerminalOpen(false);
    setRemainingTime(null);
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    ptyBufferRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  return (
    <div className="app-container">
      <h1>Chaos Lab</h1>
      <p>The scenario is: {scenario}</p>
      <button onClick={startConnection} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }} disabled={isConnecting || isTerminalOpen}>
        {isConnecting ? 'Connecting...' : 'Run Terraform & Open Terminal'}
      </button>

      {/* --- THIS IS THE LOADING BAR, NOW RESTORED --- */}
      {isConnecting && (
        <div className="loading-container">
          <p>Provisioning AWS instance and establishing SSH connection...</p>
          <div className="loading-bar"><div className="loading-progress"></div></div>
          <p className="loading-subtext">This process can take up to 5 minutes</p>
        </div>
      )}

      {connectionError && (
        <div className="error-container">
          <span><strong>Error:</strong> {connectionError}</span>
          <button onClick={() => setConnectionError(null)}>Dismiss</button>
        </div>
      )}
      
      {isTerminalOpen && socketRef.current && (
        <TerminalWindow isOpen={isTerminalOpen} onClose={closeTerminalWindow}>
          {/* This is the original, working main container */}
          <div style={{ padding: '1rem', height: '100vh', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', backgroundColor: '#282828' }}>
            
            {/* --- THIS IS THE FIX --- */}
            {/* We replace the original <h2> with a new flex container for the title bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingBottom: '1rem' }}>
              <h2 style={{ color: '#ebdbb2', fontFamily: 'monospace', margin: 0 }}>
                Chaos Lab Terminal - AWS Instance
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {remainingTime !== null && (
                  <div style={{ backgroundColor: '#3c3836', color: '#ebdbb2', padding: '8px 12px', borderRadius: '5px', fontFamily: 'monospace', fontSize: '14px', border: '1px solid #504945' }}>
                    Time Left: {formatTime(remainingTime)}
                  </div>
                )}
                <button onClick={handleExtendTime} style={{ backgroundColor: '#4b3e34', color: '#ebdbb2', border: '1px solid #665c54', borderRadius: '5px', padding: '8px 16px', fontFamily: 'monospace', fontSize: '14px', cursor: 'pointer' }}>
                  Extend Session (+30 Minute)
                </button>
              </div>
            </div>
            
            {/* The TerminalView is now correctly placed to fill the remaining space */}
            {/* We wrap it in a div that can grow, which is the key to fixing the layout */}
            <div style={{ flex: 1, position: 'relative' }}>
                <TerminalView
                  socket={socketRef.current}
                  setTerminalDataHandler={setTerminalDataHandler}
                />
            </div>
          </div>
        </TerminalWindow>
      )}
    </div>
  );
}
