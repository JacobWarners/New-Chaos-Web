import * as React from 'react'
import PropTypes from 'prop-types'

import ScenarioContext from './context/ScenarioContext'

/**
 * @name ScenarioContainer
 * @component
 *
 * @param {object} _props
 *
 * @returns {React.ReactNode}
 */

function ScenarioContainer(props) {
  const {
    children,
  } = props

  const [selected, setSelected] = React.useState(null)

  const handleSelect = React.useCallback(
    (event) => {
      const { dataset } = event.target

      setSelected(dataset.repo)
    },
    []
  )

  const handleReset = React.useCallback(
    () => {
      setSelected(null)
    },
    []
  )

  const isSelected = React.useCallback(
    (repo) => {
      if (!selected) {
        return null
      }

      return selected === repo
    },
    [selected]
  )

  const provided = React.useMemo(
    () => ({
      isSelected,
      handleSelect,
      handleReset,
    }),
    [
      isSelected,
      handleSelect,
      handleReset,
    ]
  )

  return (
    <ScenarioContext.Provider value={provided}>
      <div className="weka-scenarios-container">
        {children}
      </div>
    </ScenarioContext.Provider>
  )
}

ScenarioContainer.propTypes = {
  children: PropTypes.node.isRequired,
}

export {
  ScenarioContainer as default,
}
