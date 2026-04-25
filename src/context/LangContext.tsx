import { createContext, useContext, useState } from 'react'
import { type Lang, getT, detectLang } from '../lib/i18n'

type LangContextValue = {
  lang: Lang
  setLang: (l: Lang) => void
  t: ReturnType<typeof getT>
}

const LangContext = createContext<LangContextValue>(null!)

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  function setLang(l: Lang) {
    localStorage.setItem('predictr_lang', l)
    setLangState(l)
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t: getT(lang) }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
