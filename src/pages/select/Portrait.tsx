// A Champion's idle pose from its pose sheet (fighters.ts), for menus. Sheets are per Style when a Style has its own art
// (Mage: Pyromancer / Cryomancer), so pass the Style; without one the Champion's first Style is used. No sheet = the SVG doll.
import { fighterHTML, spriteClassOf } from '../fighters'
import './select.css'

export function Portrait({ champ, style, bust, className = '' }: { champ: string; style?: string | null; bust?: boolean; className?: string }) {
  const sheet = spriteClassOf(champ, style) ?? spriteClassOf(champ, `${champ}:1`)
  return (
    <span className={`portrait${bust ? ' bust' : ''} ${className}`} aria-hidden="true">
      {sheet ? <span className={`face ${sheet}`} /> : <span className="doll" dangerouslySetInnerHTML={{ __html: fighterHTML(champ, style) }} />}
    </span>
  )
}
