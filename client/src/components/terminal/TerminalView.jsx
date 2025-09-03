import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { ClipboardAddon } from 'xterm-addon-clipboard'; // *** NEW ***
import 'xterm/css/xterm.css';
import './TerminalView.css';

function TerminalView({ sessionId, websocketPath, shouldRunTerraform }) {
  const termContainerRef = useRef(null);
  const termRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!termContainerRef.current || !sessionId) return;

    // This effect should only run once to set up the terminal
    if (!termRef.current) {
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'monospace',
        fontSize: 14,
        allowProposedApi: true, // Needed for clipboard addon
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new ClipboardAddon()); // *** THE FIX for copy/paste ***
      term.open(termContainerRef.current);
      
      // *** THE FIX for focus ***
      term.focus(); 
      fitAddon.fit();
      window.addEventListener('resize', () => fitAddon.fit());
      
      termRef.current = term;
    }

    const term = termRef.current;
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${socketProtocol}//${window.location.hostname}:5000${websocketPath}`;
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      term.writeln('\r\n\x1b[32mWebSocket: Connected to backend PTY.\x1b[0m\r\n');
      if (shouldRunTerraform) {
        term.writeln('\x1b[33mSending command to backend to start Terraform...\x1b[0m\r\n');
        socket.send(JSON.stringify({ type: 'run_terraform' }));
      }
    };

    // *** THE FIX for UI lag ***
    // This handler now ONLY expects our structured JSON messages
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pty_output' && typeof msg.payload === 'string') {
          term.write(msg.payload);
        }
      } catch (e) {
        console.error("Failed to parse message from server:", event.data, e);
      }
    };
    
    socket.onclose = () => term.writeln('\r\n\x1b[31mWebSocket Disconnected.\x1b[0m');
    socket.onerror = (error) => console.error('WebSocket Error:', error);

    const dataListener = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        // Wrap user input in our JSON protocol
        socket.send(JSON.stringify({ type: 'pty_input', payload: data }));
      }
    });

    return () => {
      dataListener.dispose();
      if (socketRef.current) socketRef.current.close();
    };
  }, [sessionId, websocketPath, shouldRunTerraform]);

  return <div ref={termContainerRef} style={{ width: '100%', height: '100%' }} />;
}

TerminalView.propTypes = {
  sessionId: PropTypes.string,
  websocketPath: PropTypes.string,
  shouldRunTerraform: PropTypes.bool,
};

export default TerminalView;
