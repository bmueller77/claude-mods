import type { LeitstandBefehl } from '../logic'

const GRUPPE = 'Werkzeuge'

/** The key of the band's skill menu 🧩, drawn by the Leitstand (a picker in the app, a sign on the terminal). */
export const KNOPF_SKILLS = 'skillmenue'

/** The commands of the skill menu, in the order of the overview. */
export const SKILLS_BEFEHLE: readonly LeitstandBefehl[] = [
  {
    name: 'leitstand:skill-menue',
    description: 'Liste aller installierten Skills zeigen',
    gruppe: GRUPPE,
    tut: 'Zeigt alle Skills, die diese Sitzung kennt, als Liste mit ihren Befehlen. Am Rechner klappt 🧩 im Band dieselbe Liste auf; eine Wahl startet den Skill, als hättest du ihn getippt.',
    knopf: 'Button: 🧩 hinter 🧹, klappt die Liste auf',
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:skill-menue',
  },
]
