import * as React from 'react'
// import PropTypes from 'prop-types'

import logo from '../assets/weka.svg'

import styles from './Header.module.css'

/**
 * @name header
 * @component
 *
 * @param {object} _props
 *
 * @returns {React.ReactNode}
 */

function Header(_props) {
  return (
    <div className={styles.container}>
      <img src={logo} alt="Weka Logo" width="200px" />
      <span className={styles.subheader}>
        Chaos Lab
      </span>
    </div>
  )
}

Header.propTypes = {}

export {
  Header as default,
}
