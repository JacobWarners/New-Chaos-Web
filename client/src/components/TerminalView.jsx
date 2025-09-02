import React, { useEffect, useRef, memo } from 'react';
import PropTypes from 'prop-types';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

// Import the core Xterm styles
import 'xterm/css/xterm.css';
// You can add custom styles in a separate CSS file if needed
import './TerminalView.css';

/**
 * A React component that renders an interactive terminal powered by Xterm.js
 * and connects it to a backend service via WebSocket.
 */
function TerminalView({ sessionId, websocketPath }) {
  // useRef is used to get a direct reference to the DOM element where the terminal will be mounted.
  // This avoids re-renders and provides a stable target for the Xterm instance.
  const termContainerRef = useRef(null);

  useEffect(() => {
    // Abort if the container isn't rendered yet.
    if (!termContainerRef.current) {
      return;
    }

    // --- 1. Initialize Terminal ---
    // Create the Xterm.js Terminal instance with custom theme and font settings.
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 15,
      fontFamily: '"Fira Code", "JetBrains Mono", Consolas, monospace',
      theme: {
        background: '#282828',
        foreground: '#ebdbb2',
        cursor: '#fe8019',
      },
    });

    // Load the "FitAddon" which allows the terminal to resize to fit its container.
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Attach the terminal to the DOM element.
    term.open(termContainerRef.current);

    // Fit the terminal to the container's size.
    fitAddon.fit();


    // --- 2. Establish WebSocket Connection ---
    // The WebSocket protocol is specified with "ws://".
    const socket = new WebSocket(`ws://localhost:5000${websocketPath}`);


    // --- 3. Wire Up Event Listeners ---

    // Fired when the WebSocket connection is successfully established.
    socket.onopen = () => {
      term.writeln('\r\n\x1b[32mWebSocket: Connected to backend session.\x1b[0m\r\n');
    };

    // Fired when a message is received from the server.
    // This is how the server sends command output back to the terminal.
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // We expect the server to send data in a JSON object like: { "output": "some text" }
        if (data && typeof data.output === 'string') {
          term.write(data.output);
        }
      } catch (e) {
        console.error("Failed to parse message from server:", event.data, e);
      }
    };

    // Fired when the user types anything into the terminal.
    // This sends the user's input to the server.
    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ input: data }));
      }
    });

    // Fired when the WebSocket connection is closed.
    socket.onclose = () => {
      term.writeln('\r\n\x1b[31mWebSocket Disconnected.\x1b[0m');
    };

    // Fired if a WebSocket error occurs.
    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
      term.writeln('\r\n\x1b[31mWebSocket Connection Error.\x1b[0m');
    };


    // --- 4. Handle Window Resizing ---
    const handleResize = () => {
      // This ensures the terminal grid resizes correctly when the browser window changes size.
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);


    // --- 5. Cleanup Logic ---
    // This function is returned by useEffect and runs when the component is unmounted.
    // It's crucial for preventing memory leaks.
    return () => {
      // Remove the resize listener to avoid errors after the component is gone.
      window.removeEventListener('resize', handleResize);
      // Gracefully close the WebSocket connection.
      socket.close();
      // Dispose of the terminal instance to free up resources.
      term.dispose();
    };

    // The effect depends on these props. If they change, it will tear down the old
    // terminal and create a new one with the new session details.
  }, [sessionId, websocketPath]);

  // The div that will contain the terminal.
  return <div ref={termContainerRef} style={{ width: '100%', height: '100%' }} />;
}

TerminalView.propTypes = {
  sessionId: PropTypes.string.isRequired,
  websocketPath: PropTypes.string.isRequired,
};

// `memo` prevents the component from re-rendering if its props haven't changed.
export default memo(TerminalView);
