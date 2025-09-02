// client/src/components/TerminalView.jsx
import React, { useEffect, useRef, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
// The 'socket.io-client' import is no longer needed.
import 'xterm/css/xterm.css';    // Imports CSS from node_modules
import './TerminalView.css';    // Imports CSS from the same directory (src/components/TerminalView.css)

const API_BASE_URL = import.meta.env.VITE_APP_BASE_URL || 'http://localhost:5000';

const MAXIMIZED_CLASS = 'terminal-instance-maximized';
const FULLSCREEN_CLASS = 'terminal-instance-fullscreen';

function TerminalView({ sessionId, websocketPath, onCloseTerminal, isMaximized, isFullscreen }) {
  const termContainerRef = useRef(null);
  const xtermInstanceRef = useRef(null);
  const socketRef = useRef(null);
  const fitAddonRef = useRef(null);

  // This function is no longer needed with standard WebSockets for this simple case.
  const sendResizeToBackend = useCallback(() => {}, []);

  const handleResizeAndNotify = useCallback(() => {
    if (xtermInstanceRef.current && fitAddonRef.current) {
      try {
        fitAddonRef.current.fit();
        console.log(`[TerminalView ${sessionId}] Fit addon executed.`);
        sendResizeToBackend();
      } catch (e) {
        console.error(`[TerminalView ${sessionId}] Error during fit or notify:`, e)
      }
    }
  }, [sessionId, sendResizeToBackend]);

  useEffect(() => {
    let term;
    let fitAddonInstance;
    let webLinksAddonInstance;
    let socket;

    if (termContainerRef.current && !xtermInstanceRef.current && sessionId && websocketPath) {
      console.log(`[TerminalView ${sessionId}] Initializing... Path: ${websocketPath}`);

      term = new Terminal({
        cursorBlink: true,
        convertEol: true,
        rows: 24,
        cols: 80,
        fontSize: 15,
        fontFamily: '"Fira Code", "JetBrains Mono", "DejaVu Sans Mono", Consolas, "Liberation Mono", Menlo, Courier, monospace',
        theme: {
          background: '#282828', foreground: '#ebdbb2', cursor: '#fe8019',
          cursorAccent: '#3c3836', selectionBackground: 'rgba(146, 131, 116, 0.5)',
          black: '#282828', brightBlack: '#928374', red: '#cc241d', brightRed: '#fb4934',
          green: '#98971a', brightGreen: '#b8bb26', yellow: '#d79921', brightYellow: '#fabd2f',
          blue: '#458588', brightBlue: '#83a598', magenta: '#b16286', brightMagenta: '#d3869b',
          cyan: '#689d6a', brightCyan: '#8ec07c', white: '#a89984', brightWhite: '#ebdbb2',
        },
        allowProposedApi: true,
        scrollback: 2000,
      });
      xtermInstanceRef.current = term;

      fitAddonInstance = new FitAddon();
      fitAddonRef.current = fitAddonInstance;
      term.loadAddon(fitAddonInstance);

      webLinksAddonInstance = new WebLinksAddon();
      term.loadAddon(webLinksAddonInstance);

      term.open(termContainerRef.current);
      try {
        handleResizeAndNotify();
      } catch(e) {
        console.error(`[TerminalView ${sessionId}] Initial fit/notify failed:`, e);
      }
      term.focus();

      // --- START: MODIFIED CONNECTION LOGIC ---
      const fullWebsocketUrl = `ws://localhost:5000${websocketPath}`; // Use ws:// protocol
      console.log(`[TerminalView ${sessionId}] Attempting WebSocket connection to: ${fullWebsocketUrl}`);
      
      socket = new WebSocket(fullWebsocketUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        term.writeln('\r\n\x1b[32mWebSocket: Connected to backend session.\x1b[0m');
        console.log(`[TerminalView ${sessionId}] WebSocket Connected.`);
        // No need to emit 'join_scenario' with this simpler setup
      };

      socket.onmessage = (event) => {
        try {
          // Messages are now plain JSON strings that need to be parsed
          const data = JSON.parse(event.data);
          if (data && typeof data.output === 'string') {
            term.write(data.output);
          }
        } catch (e) {
          console.error("Failed to parse incoming message:", event.data, e);
        }
      };
      
      socket.onclose = () => {
        const msg = `\r\n\x1b[31mWebSocket Disconnected.\x1b[0m`;
        if (term && term.element) term.writeln(msg);
        console.error(`[TerminalView ${sessionId}] WebSocket Disconnected.`);
      };

      socket.onerror = (error) => {
        const errorMsg = `\r\n\x1b[31mWebSocket Connection Error\x1b[0m`;
        if (term && term.element) term.writeln(errorMsg);
        console.error(`[TerminalView ${sessionId}] WebSocket connection error:`, error);
      };

      term.onData((data) => {
        // Check if the connection is open before sending
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          // Send data as a JSON string
          const payload = { input: data, sessionId: sessionId };
          socketRef.current.send(JSON.stringify(payload));
        } else {
          console.warn(`[TerminalView ${sessionId}] Socket not connected, dropping input: ${data}`);
          if (term && term.element) term.writeln('\r\n\x1b[31m[Client: Not connected. Cannot send input.]\x1b[0m');
        }
      });
      // --- END: MODIFIED CONNECTION LOGIC ---

      window.addEventListener('resize', handleResizeAndNotify);
    }

    return () => {
      console.log(`[TerminalView ${sessionId}] Cleaning up component...`);
      window.removeEventListener('resize', handleResizeAndNotify);
      if (socketRef.current) {
        console.log(`[TerminalView ${sessionId}] Closing socket on unmount.`);
        // Simply close the connection
        socketRef.current.close();
        socketRef.current = null;
      }
      if (xtermInstanceRef.current) {
        xtermInstanceRef.current.dispose();
        xtermInstanceRef.current = null;
      }
      if (fitAddonRef.current) {
        fitAddonRef.current.dispose();
        fitAddonRef.current = null;
      }
    };
  }, [sessionId, websocketPath, onCloseTerminal, handleResizeAndNotify]); 

  useEffect(() => {
    const container = termContainerRef.current;
    if (container) {
      if (isFullscreen) {
        container.classList.add(FULLSCREEN_CLASS);
        container.classList.remove(MAXIMIZED_CLASS);
      } else if (isMaximized) {
        container.classList.add(MAXIMIZED_CLASS);
        container.classList.remove(FULLSCREEN_CLASS);
      } else {
        container.classList.remove(MAXIMIZED_CLASS);
        container.classList.remove(FULLSCREEN_CLASS);
      }
      setTimeout(handleResizeAndNotify, 50); // Refit after class changes
    }
  }, [isMaximized, isFullscreen, handleResizeAndNotify]);

  return (
    <div ref={termContainerRef} className="terminal-instance" />
  );
}

TerminalView.propTypes = {
  sessionId: PropTypes.string.isRequired,
  websocketPath: PropTypes.string.isRequired,
  onCloseTerminal: PropTypes.func.isRequired,
  isMaximized: PropTypes.bool.isRequired,
  isFullscreen: PropTypes.bool.isRequired,
};

export default memo(TerminalView);
