import type { Register } from 'claude-code'

import { registerGlance } from './glance'
import { registerTeile } from './teile'

export const register: Register = (on, options) => {
  // Der Leitstand zuerst: Die Hooks eines Mods liegen in der Reihenfolge ihrer Anmeldung, die erste außen. So holt der
  // Leitstand die Zeile des Autopiloten aus dem, was unter ihm gezeichnet wird, und stellt sie nach oben.
  registerGlance(on, options)
  registerTeile(on, options)
}
