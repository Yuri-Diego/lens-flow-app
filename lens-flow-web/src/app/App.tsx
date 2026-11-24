import { useState } from 'react'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { Providers } from './Providers'
import { createQueryClient } from './queryClient'
import { routes } from './routes'

const router = createBrowserRouter(routes)

export function App() {
  const [queryClient] = useState(createQueryClient)
  return (
    <Providers client={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  )
}
