#!/usr/bin/env bash
# Richtet auf einer Claude-Code-Instanz alle Mods aus bjoern-mods ein (Scope user).
# Wiederholbar: bereits Installiertes wird übersprungen bzw. aktualisiert.
set -u
MARKET="${1:-bmueller77/claude-mods}"
# Der ganze Katalog. Die älteren Mods (savvy-progress, next-steps, cache-meter, cache-tax,
# catch-me-up, replay-theater, blast-radius) sind seit 2026-10-18 nicht mehr im Katalog; wo sie
# noch installiert sind, entfernt man sie mit "claude plugin uninstall <mod>@bjoern-mods".
PLUGINS="leitstand statistik naechste-schritte zusammenfassung visible-compact autopilot filetree reflect prompt-upgrade modellwahl i-have-adhd"

claude plugin marketplace add "$MARKET" 2>&1 | tail -1
claude plugin marketplace update bjoern-mods 2>&1 | tail -1
fail=0
for p in $PLUGINS; do
  out=$(claude plugin install "$p@bjoern-mods" -y 2>&1 | tail -1)
  case "$out" in *Failed*|*✘*) echo "FEHLER $p: $out"; fail=1 ;; *) echo "ok     $p" ;; esac
done
claude plugin enable cc-plugin-you-should-know@builtin 2>&1 | tail -1
echo "Fertig. In laufenden Sitzungen /reload-plugins eingeben."
exit $fail
