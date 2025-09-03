import { useState, useCallback, useRef, useEffect } from 'react'
import { createFileRoute } from "@tanstack/react-router"
import TerminalWindow from '../components/terminal/TerminalWindow'
import TerminalView from '../components/terminal/TerminalView'

import './ScenarioRoute.css'; 

export const Route = createFileRoute('/$scenario')({
  component: ScenarioRoute
})

function ScenarioRoute() {
  const { scenario } = Route.useParams()
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const socketRef = useRef(null);
  
  const terminalDataHandlerRef = useRef(null);
  // Buffer to store PTY output until terminal is ready
  const ptyBufferRef = useRef([]);

  const setTerminalDataHandler = useCallback((handler) => {
    console.log("TerminalView handler has been", handler ? "REGISTERED." : "UNREGISTERED.");
    terminalDataHandlerRef.current = handler;
    
    // When handler is registered, flush any buffered data
    if (handler && ptyBufferRef.current.length > 0) {
      console.log(`Flushing ${ptyBufferRef.current.length} buffered PTY messages to terminal`);
      ptyBufferRef.current.forEach(data => {
        try {
          handler(data);
        } catch (e) {
          console.error("Error writing buffered data to terminal:", e);
        }
      });
      ptyBufferRef.current = []; // Clear the buffer
    }
  }, []);

  const startConnection = useCallback(() => {
    if (isConnecting || isTerminalOpen) return;

    setIsConnecting(true);
    setConnectionError(null);

    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${socketProtocol}//${window.location.hostname}:5000/terminal`;
    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("<- [FE-SOCKET] Connection opened. Sending 'run_terraform'...");
      ws.send(JSON.stringify({ type: 'run_terraform' }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("<- [FE-MSG-RECV]", msg);
        
        if (msg.type === 'status' && msg.payload === 'connected' && !isTerminalOpen) {
          console.log("<- [FE-STATUS] 'connected' received. Opening terminal window.");
          setIsConnecting(false);
          setIsTerminalOpen(true);
        } 
        else if (msg.type === 'pty_output') {
          if (terminalDataHandlerRef.current) {
            // Terminal is ready, write directly
            terminalDataHandlerRef.current(msg.payload);
          } else {
            // Terminal not ready yet, buffer the data
            console.warn("<- [FE-WARN] Got PTY data, but no terminal handler is registered yet. Buffering...");
            ptyBufferRef.current.push(msg.payload);
          }
        }
        else if (msg.type === 'error') {
          console.error("<- [FE-ERROR] Received error from backend:", msg.payload);
          setConnectionError(msg.payload);
          setIsConnecting(false);
          ws.close();
        }
      } catch (e) {
        console.error("<- [FE-ERROR] Failed to parse message from backend:", event.data);
      }
    };

    ws.onerror = (error) => {
      console.error("<- [FE-SOCKET] WebSocket error:", error);
      setConnectionError("Failed to connect to the server's WebSocket.");
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
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    // Clear any buffered data
    ptyBufferRef.current = [];
  }, []);
  
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      // Clear buffer on unmount
      ptyBufferRef.current = [];
    }
  }, []);

  return (
    <div className="scenario-container">
      <h1>Scenario: {scenario}</h1>
      
      {!isConnecting && !isTerminalOpen && (
        <button onClick={startConnection} className="start-button">
          Start Environment
        </button>
      )}

      {isConnecting && (
        <div className="loading-container">
          <div className="loading-bar">
            <div className="loading-progress"></div>
          </div>
          <p>Setting up your AWS infrastructure...</p>
          <p className="loading-subtext">This may take up to 5 minutes</p>
        </div>
      )}

      {connectionError && (
        <div className="error-container">
          <span>{connectionError}</span>
          <button onClick={() => setConnectionError(null)}>Dismiss</button>
        </div>
      )}

      {isTerminalOpen && socketRef.current && (
        <TerminalWindow isOpen={isTerminalOpen} onClose={closeTerminalWindow}>
          <TerminalView 
            socket={socketRef.current} 
            setTerminalDataHandler={setTerminalDataHandler}
          />
        </TerminalWindow>
      )}
    </div>
  );
}

export default ScenarioRoute;
