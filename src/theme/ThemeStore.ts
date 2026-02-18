import { makeAutoObservable } from 'mobx'
import { Theme } from './types'
import { lightTheme } from './lightTheme'
import { darkTheme } from './darkTheme'

const STORAGE_KEY = 'theme-mode'

export class ThemeStore {
  isDarkMode: boolean

  constructor() {
    this.isDarkMode = this.loadPreference()
    makeAutoObservable(this)
  }

  get theme(): Theme {
    return this.isDarkMode ? darkTheme : lightTheme
  }

  toggleTheme = (): void => {
    this.isDarkMode = !this.isDarkMode
    localStorage.setItem(STORAGE_KEY, this.isDarkMode ? 'dark' : 'light')
  }

  private loadPreference(): boolean {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored === 'dark'
    // Fall back to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
}
