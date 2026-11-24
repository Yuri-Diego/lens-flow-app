import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// findBy* e waitFor esperam até 3 s (o padrão é 1 s). Testes que renderizam o
// app inteiro passavam do limite com a máquina carregada (CI, servidores locais).
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
