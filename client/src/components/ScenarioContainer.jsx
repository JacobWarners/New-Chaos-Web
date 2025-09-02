import React from 'react';
import PropTypes from 'prop-types';

/**
 * A simple layout container for the scenario cards.
 */
function ScenarioContainer({ children }) {
  return (
    <div className="weka-scenarios-container">
      {children}
    </div>
  );
}

ScenarioContainer.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ScenarioContainer;

