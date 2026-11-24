import {
  Boxes,
  CalendarDays,
  ClipboardCheck,
  House,
  Menu,
  PackageCheck,
  Search,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/api'

export interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
  /** Só aparece para este perfil. */
  role?: Role
}

export const NAV = {
  today: { to: '/hoje', label: 'Hoje', Icon: House },
  review: { to: '/conferencia', label: 'Conferência', Icon: ClipboardCheck },
  search: { to: '/buscar', label: 'Buscar', Icon: Search },
  more: { to: '/mais', label: 'Mais', Icon: Menu },
  checkouts: { to: '/baixas', label: 'Baixas', Icon: PackageCheck },
  sheets: { to: '/folhas', label: 'Folhas', Icon: CalendarDays },
  boxes: { to: '/caixas', label: 'Caixas', Icon: Boxes, role: 'admin' },
  users: { to: '/usuarios', label: 'Usuários', Icon: Users, role: 'admin' },
  account: { to: '/conta', label: 'Minha conta', Icon: UserRound },
} satisfies Record<string, NavItem>

/** Barra inferior do celular: Hoje · Conferência · Buscar · Mais. */
export const BOTTOM_NAV: NavItem[] = [NAV.today, NAV.review, NAV.search, NAV.more]

/** O que fica dentro de "Mais" no celular. */
export const MORE_ITEMS: NavItem[] = [NAV.checkouts, NAV.sheets, NAV.boxes, NAV.users, NAV.account]

/** Barra lateral do computador, em grupos. */
export const SIDEBAR_GROUPS: Array<{ label?: string; items: NavItem[] }> = [
  { items: [NAV.today, NAV.review, NAV.checkouts, NAV.search, NAV.sheets] },
  { label: 'Administração', items: [NAV.boxes, NAV.users] },
  { items: [NAV.account] },
]

export function visibleFor(items: NavItem[], role: Role | undefined): NavItem[] {
  return items.filter((item) => !item.role || item.role === role)
}

/** "Mais" fica ativo nas telas que moram dentro dele. */
export function isInMore(pathname: string): boolean {
  return [NAV.more, ...MORE_ITEMS].some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
}
