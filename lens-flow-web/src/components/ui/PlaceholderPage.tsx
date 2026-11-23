import type { ReactNode } from 'react'
import { Construction } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { PageHeader } from './PageHeader'

/** Página com título e estado vazio, para as telas que a F5 e a F6 vão preencher. */
export function PlaceholderPage({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <section>
      <PageHeader title={title} description={description} />
      {children ?? (
        <EmptyState
          icon={Construction}
          title="Tela em construção"
          description="Esta tela chega numa próxima versão do Lens Flow."
        />
      )}
    </section>
  )
}
