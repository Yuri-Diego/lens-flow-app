import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PlaceholderPage } from '@/components/ui/PlaceholderPage'

export function TodayPage() {
  return (
    <PlaceholderPage title="Hoje" description="Os serviços lançados hoje e os pendentes de dias anteriores.">
      <Link
        to="/servicos/novo"
        className="focus-ring inline-flex min-h-touch-lg w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-lg font-semibold text-ink-inverse hover:bg-primary-hover md:w-auto"
      >
        <Plus aria-hidden="true" className="size-5" />
        Novo serviço
      </Link>
    </PlaceholderPage>
  )
}
