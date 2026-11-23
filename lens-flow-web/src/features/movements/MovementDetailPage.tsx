import { useParams } from 'react-router-dom'
import { PlaceholderPage } from '@/components/ui/PlaceholderPage'

export function MovementDetailPage() {
  const { id } = useParams()
  return <PlaceholderPage title="Detalhe do serviço" description={`Serviço ${id ?? ''}: dados e linha do tempo.`} />
}
