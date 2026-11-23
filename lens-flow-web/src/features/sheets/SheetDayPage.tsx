import { useParams } from 'react-router-dom'
import { PlaceholderPage } from '@/components/ui/PlaceholderPage'

/** `AAAA-MM-DD` → `dd/mm/aaaa`, sem passar pelo relógio do aparelho. */
function formatSheetDate(date: string | undefined): string {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (date ?? '')
}

export function SheetDayPage() {
  const { date } = useParams()
  return <PlaceholderPage title={`Folha de ${formatSheetDate(date)}`} description="Os serviços lançados neste dia." />
}
