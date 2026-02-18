import { makeObservable, observable, computed, action } from 'mobx'
import { Theme } from './types'
import { lightTheme } from './lightTheme'
import { darkTheme } from './darkTheme'

const STORAGE_KEY = 'theme-mode'

export class ThemeStore {
  @observable isDarkMode: boolean

  constructor() {
    this.isDarkMode = this.loadPreference()
    makeObservable(this)
  }

  @computed get theme(): Theme {
    return this.isDarkMode ? darkTheme : lightTheme
  }

  @action toggleTheme = (): void => {
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
