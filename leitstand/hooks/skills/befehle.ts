import type { LeitstandBefehl } from '../logic'

const GRUPPE = 'Werkzeuge'

/** The key of the band's skill menu 🧩, drawn by the Leitstand (a hover menu in the app, a sign on the terminal). */
export const KNOPF_SKILLS = 'skillmenue'

/** The commands of the skill menu, in the order of the overview. */
export const SKILLS_BEFEHLE: readonly LeitstandBefehl[] = [
  {
    name: 'leitstand:skill-menue',
    description: 'Zeigt beim Darüberfahren die Skills nach Anwendungsfall; ein Klick startet einen.',
    gruppe: GRUPPE,
    tut: 'Zeigt alle Skills, die diese Sitzung kennt, nach Anwendungsfall mit ihren Befehlen und je einem Satz, was man damit tut. Am Rechner zeigt 🧩 dieselbe Liste, wenn du mit der Maus darüberfährst: links die Kategorien, rechts die Skills der Kategorie unter der Maus, über jedem Skill sein Satz; ein Klick startet den Skill, als hättest du ihn getippt.',
    knopf: 'Button: 🧩 hinter 🧹, zeigt die Kategorien, wenn du mit der Maus darüberfährst',
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:skill-menue',
  },
]
