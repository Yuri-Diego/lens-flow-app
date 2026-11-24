import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { TextField, type TextFieldProps } from './TextField'

export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false)

  return (
    <TextField
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className="focus-ring flex size-touch items-center justify-center rounded-xl text-ink-muted hover:text-ink"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      }
    />
  )
}
