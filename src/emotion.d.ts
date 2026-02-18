import '@emotion/react'
import { Theme as AppTheme } from './theme/types'

declare module '@emotion/react' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface Theme extends AppTheme {}
}
