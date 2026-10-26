import { LANGS, setLang, useLang } from '.'

/** ไทย | EN switch, for the Champion select header and the in-match Settings sheet. */
export function LangToggle({ className = '' }: { className?: string }) {
  const lang = useLang()
  return (
    <div className={`lang-toggle ${className}`} role="radiogroup" aria-label="Language / ภาษา">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={lang === l.id}
          onClick={(e) => (e.stopPropagation(), setLang(l.id))}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
