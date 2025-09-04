import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import './TerminalView.css';

function TerminalView({ socket, setTerminalDataHandler }) {
  const termContainerRef = useRef(null);
  // Refs to hold instances so they persist across re-renders
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);

  // This effect runs only ONCE to CREATE and DESTROY the terminal UI.
  // Its empty dependency array `[]` makes it immune to parent re-renders and Strict Mode remounts.
  useEffect(() => {
    if (!termContainerRef.current || termRef.current) {
      return;
    }
    console.log("[TerminalView] Initializing xterm.js UI instance...");
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      theme: { // Your preferred Gruvbox theme
        background: '#282828', foreground: '#ebdbb2', cursor: '#fe8019',
        selectionBackground: 'rgba(146, 131, 116, 0.5)',
        black: '#282828', brightBlack: '#928374', red: '#cc241d', brightRed: '#fb4934',
        green: '#98971a', brightGreen: '#b8bb26', yellow: '#d79921', brightYellow: '#fabd2f',
        blue: '#458588', brightBlue: '#83a598', magenta: '#b16286', brightMagenta: '#d3869b',
        cyan: '#689d6a', brightCyan: '#8ec07c', white: '#a89984', brightWhite: '#ebdbb2',
      },
    });
    termRef.current = term;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(termContainerRef.current);
    
    const handleResize = () => {
        try {
            fitAddon.fit();
        } catch (e) {
            console.warn("Could not fit terminal during resize:", e.message);
        }
    };
    
    handleResize(); // Initial fit
    window.addEventListener('resize', handleResize);
    
    return () => {
      console.log("[TerminalView] Disposing xterm.js UI instance.");
      window.removeEventListener('resize', handleResize);
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, []); // Empty dependency array is KEY to stability.

  // This separate effect handles COMMUNICATION logic.
  // It can re-run safely if the socket prop changes, without destroying the UI.
  useEffect(() => {
    if (!socket || !setTerminalDataHandler || !termRef.current) {
      return;
    }
    const term = termRef.current;
    
    const writeToTerminal = (data) => {
      term.write(data);
    };
    
    // Register the data handler with the parent component ($scenario.jsx)
    setTerminalDataHandler(writeToTerminal);

    const dataListener = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'pty_input', payload: data }));
      }
    });

    // Cleanup for THIS effect
    return () => {
      console.log("[TerminalView] Cleaning up communication listeners.");
      setTerminalDataHandler(null);
      dataListener.dispose();
    };
  }, [socket, setTerminalDataHandler]);

  return <div id="terminal" ref={termContainerRef} style={{ width: '100%', height: '100%' }} />;
}

TerminalView.propTypes = {
  socket: PropTypes.instanceOf(WebSocket).isRequired,
  setTerminalDataHandler: PropTypes.func.isRequired,
};

export default TerminalView;
