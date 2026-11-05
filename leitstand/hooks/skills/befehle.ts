import type { LeitstandBefehl } from '../logic'

const GRUPPE = 'Werkzeuge'

/** The key of the band's skill menu 🧩, drawn by the Leitstand (a picker in the app, a sign on the terminal). */
export const KNOPF_SKILLS = 'skillmenue'

/** The commands of the skill menu, in the order of the overview. */
export const SKILLS_BEFEHLE: readonly LeitstandBefehl[] = [
  {
    name: 'leitstand:skill-menue',
    description: 'Klappt die installierten Skills nach Kategorien auf; eine Wahl startet den Skill.',
    gruppe: GRUPPE,
    tut: 'Zeigt alle Skills, die diese Sitzung kennt, nach Kategorien mit ihren Befehlen. Am Rechner klappt 🧩 im Band dieselbe Liste auf: erst die Kategorien, dann die Skills der gewählten; eine Wahl startet den Skill, als hättest du ihn getippt.',
    knopf: 'Button: 🧩 hinter 🧹, klappt die Kategorien auf',
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:skill-menue',
  },
]
