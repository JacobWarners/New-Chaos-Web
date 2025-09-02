import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import './TerminalView.css';

function TerminalView({ sessionId, websocketPath }) {
  const termContainerRef = useRef(null);
  const termRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!termContainerRef.current || !sessionId) {
      return;
    }

    // --- 1. Initialize Terminal ---
    if (!termRef.current) {
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: 'monospace',
            fontSize: 14,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(termContainerRef.current);
        fitAddon.fit();
        termRef.current = term;

        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);
    }
    
    // --- 2. Establish WebSocket Connection ---
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${socketProtocol}//${window.location.hostname}:5000${websocketPath}`;
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    // --- 3. Wire Up Event Listeners ---
    socket.onopen = () => {
      termRef.current.writeln('\r\n\x1b[32mWebSocket: Connected to backend session.\x1b[0m\r\n');
    };

    // THIS IS FIX #1: Parse incoming messages from the server
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // We expect JSON like: { "output": "some text" }
        if (data && typeof data.output === 'string') {
          termRef.current.write(data.output);
        }
      } catch (e) {
        console.error("Failed to parse JSON from server:", event.data, e);
      }
    };
    
    socket.onclose = () => {
      termRef.current.writeln('\r\n\x1b[31mWebSocket Disconnected.\x1b[0m');
    };

    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
      termRef.current.writeln('\r\n\x1b[31mWebSocket Connection Error.\x1b[0m');
    };

    // THIS IS FIX #2: Wrap user input in a JSON object before sending
    const dataListener = termRef.current.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ input: data }));
        }
    });

    // --- 5. Cleanup Logic ---
    return () => {
      dataListener.dispose();
      if (socketRef.current && socketRef.current.readyState < 2) {
          socketRef.current.close();
      }
    };

  }, [sessionId, websocketPath]);

  return <div ref={termContainerRef} style={{ width: '100%', height: '100%' }} />;
}

TerminalView.propTypes = {
  sessionId: PropTypes.string,
  websocketPath: PropTypes.string,
};

export default TerminalView;
