// import * as React from 'react'
// import PropTypes from 'prop-types'

/**
 * @name Conditionally
 * @component
 *
 * @param {object}          props
 * @param {React.ReactNode} props.children
 * @param {React.ReactNode} props.otherwise
 * @param {boolean}         props.when
 *
 * @returns {React.ReactNode}
 */

function Conditionally(props) {
  const {
    children,
    otherwise,
    when,
  } = props

  return when ? children : otherwise
}

Conditionally.propTypes = {}

export {
  Conditionally as default,
}
