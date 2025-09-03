import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import './TerminalView.css';

function TerminalView({ socket, setTerminalDataHandler }) {
  const termContainerRef = useRef(null);
  // THIS IS THE KEY: Store the xterm.js instance in a ref to make it persistent across re-renders.
  const termRef = useRef(null);

  // This effect runs only ONCE when the component mounts to CREATE the terminal.
  useEffect(() => {
    if (!termContainerRef.current) return;

    console.log("[TerminalView] Initializing xterm.js instance...");

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'monospace',
      fontSize: 14,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termContainerRef.current);
    term.focus();
    fitAddon.fit();
    
    // Store the created instance in our persistent ref.
    termRef.current = term;

    const resizeListener = () => fitAddon.fit();
    window.addEventListener('resize', resizeListener);

    // This is the cleanup function that runs when the component truly unmounts for good.
    return () => {
      console.log("[TerminalView] Disposing xterm.js instance.");
      window.removeEventListener('resize', resizeListener);
      // Check if termRef.current exists before disposing
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, []); // Empty dependency array means this effect runs only on mount and unmount.


  // This separate effect handles the COMMUNICATION logic.
  useEffect(() => {
    // Don't do anything until the socket is ready and the terminal has been created.
    if (!socket || !setTerminalDataHandler || !termRef.current) return;

    const term = termRef.current;

    // The function to write data to the terminal. It's stable because it reads from the ref.
    const writeToTerminal = (data) => {
      term.write(data);
    };

    // Register the handler with the parent component.
    setTerminalDataHandler(writeToTerminal);

    // Set up the listener for user input.
    const dataListener = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        console.log("-> [FE-MSG-SEND]", { type: 'pty_input', payload: data });
        socket.send(JSON.stringify({ type: 'pty_input', payload: data }));
      }
    });

    // When the component re-renders or unmounts, unregister the handler and listener.
    return () => {
      setTerminalDataHandler(null);
      if (dataListener) {
        dataListener.dispose();
      }
    };
  }, [socket, setTerminalDataHandler]); // This effect re-runs if the socket or handler function changes.


  return <div ref={termContainerRef} style={{ width: '100%', height: '100%' }} />;
}

TerminalView.propTypes = {
  socket: PropTypes.instanceOf(WebSocket).isRequired,
  setTerminalDataHandler: PropTypes.func.isRequired,
};

export default TerminalView;
