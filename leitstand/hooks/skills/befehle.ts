import type { LeitstandBefehl } from '../logic'

const GRUPPE = 'Werkzeuge'

/** The key of the band's button 🧩, drawn by the Leitstand; the part skills answers its press with the pane Skills. */
export const KNOPF_SKILLS = 'skillmenue'

/** The commands of the skill menu, in the order of the overview. */
export const SKILLS_BEFEHLE: readonly LeitstandBefehl[] = [
  {
    name: 'leitstand:skill-menue',
    description: 'Öffnet das Fenster Skills: alle Skills nach Anwendungsfall mit Kurzbeschreibung; ein Klick startet einen.',
    gruppe: GRUPPE,
    tut: 'Öffnet das Fenster Skills: alle Skills, die diese Sitzung kennt, nach Anwendungsfall, je Skill ein Button mit seinem Namen und dahinter ein Satz, was man damit tut. Ein Klick auf einen Skill startet ihn, als hättest du ihn getippt; das Fenster bleibt offen. Vom Handy oder ohne Fenster antwortet der Befehl mit derselben Liste als Text, je Skill sein Befehl und sein Satz.',
    knopf: 'Button: 🧩 hinter 🧹, öffnet das Fenster Skills',
    gilt: 'einmal',
    argumente: '',
    beispiel: '/leitstand:skill-menue',
  },
]
