import type { AwardsShow } from './types'
import raw from '../data/awards-2026.json'

// The baked ceremony data. Regenerate with `npm run harvest && npm run judge`.
export const show = raw as AwardsShow
