import { render, screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}))

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-22T12:00:00-03:00'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    axios.get.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renderiza a tela inicial sem chamar a API real', async () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Movimentações de hoje' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/22\/11\/2026/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('Carregando movimentos...')).not.toBeInTheDocument(),
    )
    expect(axios.get).toHaveBeenCalledTimes(1)
  })
})
