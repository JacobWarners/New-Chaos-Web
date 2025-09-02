function createClassArray(...args) {
  let classes = []

  args.forEach((arg) => {
    if (!arg) return

    const argType = typeof arg

    if (argType === 'string') {
      classes = classes.concat([arg])
    } else if (Array.isArray(arg) && arg.length) {
      classes = classes.concat(createClassArray(arg))
    } else if (argType === 'object') {
      Object.entries(arg).forEach(([key, value]) => {
        if (value) {
          classes = classes.concat([key])
        }
      })
    }
  })

  return classes
}

function addClasses(...args) {
  return createClassArray(...args).join(' ')
}

export {
  addClasses as default,
}