import { Navigate, type RouteObject } from 'react-router-dom'
import { RequireAuth, RequireRole } from '@/lib/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { BoxDetailPage } from '@/features/boxes/BoxDetailPage'
import { BoxesPage } from '@/features/boxes/BoxesPage'
import { CheckoutsPage } from '@/features/movements/CheckoutsPage'
import { MovementDetailPage } from '@/features/movements/MovementDetailPage'
import { NewMovementPage } from '@/features/movements/NewMovementPage'
import { ReviewPage } from '@/features/movements/ReviewPage'
import { SearchPage } from '@/features/movements/SearchPage'
import { SheetDayPage } from '@/features/sheets/SheetDayPage'
import { SheetsPage } from '@/features/sheets/SheetsPage'
import { TodayPage } from '@/features/sheets/TodayPage'
import { AccountPage } from '@/features/users/AccountPage'
import { UsersPage } from '@/features/users/UsersPage'
import { AppShell } from './AppShell'
import { MorePage } from './MorePage'
import { NotFoundPage } from './NotFoundPage'

/** Rotas do MVP (seção 6 da especificação). Endereços em pt-BR. */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/hoje" replace /> },
      { path: 'hoje', element: <TodayPage /> },
      { path: 'servicos/novo', element: <NewMovementPage /> },
      { path: 'servicos/:id', element: <MovementDetailPage /> },
      { path: 'conferencia', element: <ReviewPage /> },
      { path: 'baixas', element: <CheckoutsPage /> },
      { path: 'buscar', element: <SearchPage /> },
      { path: 'folhas', element: <SheetsPage /> },
      { path: 'folhas/:date', element: <SheetDayPage /> },
      { path: 'conta', element: <AccountPage /> },
      { path: 'mais', element: <MorePage /> },
      {
        element: <RequireRole role="admin" />,
        children: [
          { path: 'caixas', element: <BoxesPage /> },
          { path: 'caixas/:id', element: <BoxDetailPage /> },
          { path: 'usuarios', element: <UsersPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
