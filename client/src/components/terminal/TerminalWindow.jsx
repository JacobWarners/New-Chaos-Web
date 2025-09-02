import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

function TerminalWindow({ isOpen, children, onClose }) {
  const terminalWindowRef = useRef(null);
  const containerRef = useRef(null);

  // Lazily create the container div only once.
  if (!containerRef.current) {
    containerRef.current = document.createElement('div');
  }

  useEffect(() => {
    // If the window should be open but isn't, open it.
    if (isOpen && !terminalWindowRef.current) {
      const newWindow = window.open('', '', 'width=1200,height=800,left=200,top=200');
      terminalWindowRef.current = newWindow;

      // Append the container for React content
      newWindow.document.body.appendChild(containerRef.current);
      newWindow.document.title = "Chaos Lab Terminal";

      // Style the new window's body
      const doc = newWindow.document;
      doc.body.style.margin = '0';
      doc.body.style.backgroundColor = '#1d2021';

      // Copy same-origin stylesheets
      Array.from(document.styleSheets)
        .filter(sheet => !sheet.href || sheet.href.startsWith(window.location.origin))
        .forEach(sheet => {
          try {
            const cssRules = Array.from(sheet.cssRules).map(rule => rule.cssText).join('');
            const style = doc.createElement('style');
            style.textContent = cssRules;
            doc.head.appendChild(style);
          } catch (e) {
            console.warn('Could not copy stylesheet:', e);
          }
        });
      
      // When the user manually closes the pop-out, trigger the onClose callback
      newWindow.addEventListener('beforeunload', onClose);
    }

    // This cleanup function will run when isOpen becomes false or the component unmounts
    return () => {
      if (terminalWindowRef.current) {
        // Remove the event listener to prevent memory leaks
        terminalWindowRef.current.removeEventListener('beforeunload', onClose);
        // Close the window
        terminalWindowRef.current.close();
        // Clear the ref
        terminalWindowRef.current = null;
      }
    };
    // The effect now correctly depends on isOpen and onClose
  }, [isOpen, onClose]);

  // Only render the portal if the window is supposed to be open.
  if (!isOpen) {
    return null;
  }

  // Use the portal to render the children into the pop-out window's container div.
  return createPortal(children, containerRef.current);
}

TerminalWindow.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  children: PropTypes.node.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default TerminalWindow;
