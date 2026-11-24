import { Link } from 'react-router-dom'
import { MapPinOff } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'

export function NotFoundPage() {
  return (
    <section>
      <PageHeader title="Página não encontrada" />
      <EmptyState
        icon={MapPinOff}
        title="Este endereço não existe"
        description="Confira o link ou volte para a tela Hoje."
        action={
          <Link
            to="/hoje"
            className="focus-ring inline-flex min-h-touch items-center rounded-xl bg-primary px-4 font-semibold text-ink-inverse"
          >
            Ir para Hoje
          </Link>
        }
      />
    </section>
  )
}
