import * as React from 'react'

function useFormState() {
  const [selected, setSelected] = React.useState(null)

  const handleSelect = React.useCallback(
    (event) => {
      const { dataset } = event.target

      setSelected(dataset.repo)
    },
    []
  )

  const isSelected = React.useCallback(
    (repo) => {
      if (!selected) {
        return false
      }

      return selected === repo
    },
    [selected]
  )

  return {
    isSelected,
    handleSelect,
  }
}

export {
  useFormState as default,
}