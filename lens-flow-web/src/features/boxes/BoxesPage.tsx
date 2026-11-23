import { PlaceholderPage } from '@/components/ui/PlaceholderPage'
import { EmptyState } from '@/components/ui/EmptyState'
import { Construction } from 'lucide-react'
import { BoxChip } from './BoxChip'
import { BOX_COLOR_ORDER } from './boxColors'

export function BoxesPage() {
  return (
    <PlaceholderPage title="Caixas" description="Todas as caixas por cor, com o estado de cada uma.">
      <div className="flex flex-col gap-4">
        <section aria-labelledby="box-legend" className="rounded-2xl border border-line bg-surface p-4">
          <h2 id="box-legend" className="mb-3 text-base font-semibold text-ink">
            Cores e categorias
          </h2>
          <ul className="flex flex-wrap gap-2">
            {BOX_COLOR_ORDER.map((color) => (
              <li key={color}>
                <BoxChip color={color} />
              </li>
            ))}
          </ul>
        </section>
        <EmptyState
          icon={Construction}
          title="Tela em construção"
          description="O cadastro e a grade de caixas chegam numa próxima versão do Lens Flow."
        />
      </div>
    </PlaceholderPage>
  )
}
