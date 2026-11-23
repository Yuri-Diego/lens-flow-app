import { useParams } from 'react-router-dom'
import { PlaceholderPage } from '@/components/ui/PlaceholderPage'

export function BoxDetailPage() {
  const { id } = useParams()
  return <PlaceholderPage title="Caixa" description={`Caixa ${id ?? ''}: estado e serviço atual.`} />
}
