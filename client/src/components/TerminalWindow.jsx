import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

function TerminalWindow({ children, onClose }) {
  // Use a ref to hold the container div. This is more stable than state and avoids re-renders.
  const containerRef = useRef(null);

  // Lazily create the container div only once.
  if (!containerRef.current) {
    containerRef.current = document.createElement('div');
  }

  useEffect(() => {
    // This effect runs only once when the component mounts.
    const newWindow = window.open('', '', 'width=1200,height=800,left=200,top=200');
    
    // Attach our persistent container div to the new window.
    newWindow.document.body.appendChild(containerRef.current);
    newWindow.document.title = "Chaos Lab Terminal";
    
    // Add event listener for when the user manually closes the pop-up.
    newWindow.addEventListener('beforeunload', onClose);

    // Style the new window's body.
    const doc = newWindow.document;
    doc.body.style.margin = '0';
    doc.body.style.backgroundColor = '#1d2021';
    
    // Copy only same-origin stylesheets to prevent cross-origin security errors.
    Array.from(document.styleSheets)
      .filter(sheet => !sheet.href || sheet.href.startsWith(window.location.origin))
      .forEach(sheet => {
        try {
          const cssRules = Array.from(sheet.cssRules).map(rule => rule.cssText).join('');
          const style = doc.createElement('style');
          style.textContent = cssRules;
          doc.head.appendChild(style);
        } catch (e) {
          // Ignore stylesheets that can't be accessed.
        }
      });
      
    // This is the cleanup function that runs when the component unmounts.
    return () => {
      newWindow.removeEventListener('beforeunload', onClose);
      newWindow.close();
    };
  }, [onClose]);

  // Use the portal to render the children into our persistent container div.
  return createPortal(children, containerRef.current);
}

TerminalWindow.propTypes = {
  children: PropTypes.node.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default TerminalWindow;


