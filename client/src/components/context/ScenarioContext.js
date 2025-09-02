import * as React from 'react'

const ScenarioContext = React.createContext()

function useScenarioContext() {
  const context = React.useContext(ScenarioContext)

  if (!context) {
    throw new Error('useScenarioContext must be used within a ScenarioProvider')
  }

  return context
}

export {
  ScenarioContext as default,
  useScenarioContext,
}