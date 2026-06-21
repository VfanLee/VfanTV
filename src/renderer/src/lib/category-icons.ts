import { Film, Mic2, Tv } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RecommendationItem } from '@shared/types'

export const categoryIcons: Record<RecommendationItem['category'], LucideIcon> = {
  movie: Film,
  tv: Tv,
  show: Mic2,
}
