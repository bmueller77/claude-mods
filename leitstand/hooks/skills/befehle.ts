import type { LeitstandBefehl } from '../logic'

const GRUPPE = 'Werkzeuge'

/** The id of the Skills pane. */
export const FENSTER_SKILLS = 'leitstand-skills'

/** The title of the Skills pane. */
export const TITEL_SKILLS = 'Skills'

/** The key of the band button that opens the Skills pane (drawn by the Leitstand, pressed into this part). */
export const KNOPF_SKILLS = 'skillmenue'

/** The commands of the skill menu, in the order of the overview. */
export const SKILLS_BEFEHLE: readonly LeitstandBefehl[] = [
  {
    name: 'leitstand:skill-menue',
    description: 'Menü mit allen installierten Skills öffnen und einen starten',
    gruppe: GRUPPE,
    tut: 'Öffnet das Fenster Skills mit allen Skills, die diese Sitzung kennt. Wählst du einen, schließt sich das Fenster, und der Skill startet, als hättest du ihn getippt. Vom Handy oder ohne Fenster kommt die Liste als Text.',
    knopf: 'Button: 🧩 hinter 🧹',
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:skill-menue',
  },
]
