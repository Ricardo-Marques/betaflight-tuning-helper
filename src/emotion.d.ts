import '@emotion/react'
import { Theme as AppTheme } from './theme/types'

declare module '@emotion/react' {
  export interface Theme extends AppTheme {}
}
