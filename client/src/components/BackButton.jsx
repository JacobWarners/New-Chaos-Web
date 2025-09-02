// import * as React from 'react'
// import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { useScenarioContext } from './context'

import styles from './BackButton.module.css'

/**
 * @name BackButton
 * @component
 *
 * @param {object} _props
 *
 * @returns {React.ReactNode}
 */

function BackButton(_props) {
  const {
    handleReset,
  } = useScenarioContext()

  return (
    <button
      className={styles.button}
      onClick={handleReset}
      type="button"
    >
      <FontAwesomeIcon icon="fa-solid fa-xmark" />
    </button>
  )
}

BackButton.propTypes = {}

export {
  BackButton as default,
}
