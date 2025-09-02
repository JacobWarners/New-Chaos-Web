import TextField from '@mui/material/TextField'

function CustomTextField(props) {
  return (
    <TextField
      {...props}
      sx={{
        backgroundColor: 'white',
        '& .MuiInputBase-input': { color: 'black' },
        '& .MuiInputLabel-root': { color: 'grey'},
        '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
          borderColor: 'grey',
        },
        '& .MuiInputBase-input::placeholder': { color: 'grey' },
        ...props.sx, // Allow further customization
      }}
    />
  )
}

export default CustomTextField

