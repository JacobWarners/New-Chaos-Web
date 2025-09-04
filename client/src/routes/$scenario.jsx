import { useState, useCallback, useRef, useEffect } from 'react';
import { createFileRoute } from "@tanstack/react-router";
import TerminalWindow from '../components/terminal/TerminalWindow';
import TerminalView from '../components/terminal/TerminalView';
import './ScenarioRoute.css';

export const Route = createFileRoute('/$scenario')({
  component: ScenarioRoute
});

function ScenarioRoute() {
  const { scenario } = Route.useParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const socketRef = useRef(null);
  const terminalDataHandlerRef = useRef(null);
  const ptyBufferRef = useRef([]);

  const setTerminalDataHandler = useCallback((handler) => {
    // This logic remains the same
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

    // --- THIS IS THE FIX ---
    // The WebSocket should connect to the same host the page is served from.
    // window.location.host will correctly be "localhost:5173" in this environment.
    // The Go server will receive this request because of the port mapping.
    const socketUrl = `${socketProtocol}//${window.location.host}/terminal`;
    
    console.log(`Attempting to connect WebSocket to: ${socketUrl}`); // Added for debugging

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
    // This logic remains the same
    setIsTerminalOpen(false);
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    ptyBufferRef.current = [];
  }, []);
  
  useEffect(() => {
    // This logic remains the same
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  // The rest of the return statement is the same as your working version
  return (
    <div className="app-container">
      <h1>Chaos Lab</h1>
      <p>The scenario is: {scenario}</p>
      <button onClick={startConnection} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }} disabled={isConnecting || isTerminalOpen}>
        {isConnecting ? 'Connecting...' : 'Run Terraform & Open Terminal'}
      </button>
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
          <div style={{ padding: '1rem', height: '100vh', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ color: '#ebdbb2', fontFamily: 'monospace', flexShrink: 0 }}>
              Chaos Lab Terminal - AWS Instance
            </h2>
            <TerminalView
              socket={socketRef.current}
              setTerminalDataHandler={setTerminalDataHandler}
            />
          </div>
        </TerminalWindow>
      )}
    </div>
  );
}
