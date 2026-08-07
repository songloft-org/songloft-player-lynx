import { RouterProvider } from '@tanstack/react-router'

import { router } from './router.js'

export function App() {
  return <RouterProvider router={router} />
}
