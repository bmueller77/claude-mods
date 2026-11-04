#!/usr/bin/env bash
# Richtet auf einer Claude-Code-Instanz alle Mods aus bm-mods (BM-Mods) ein (Scope user).
# Wiederholbar: bereits Installiertes wird übersprungen bzw. aktualisiert.
# Bis 2026-10-29 hieß der Katalog bjoern-mods. Wer ihn noch unter dem alten Namen hat, zieht erst
# mit dem Umzug aus UPDATE.md um; sonst stünden alle Mods doppelt da.
set -u
MARKET="${1:-bmueller77/claude-mods}"
# Der ganze Katalog. Die älteren Mods (savvy-progress, next-steps, cache-meter, cache-tax,
# catch-me-up, replay-theater, blast-radius) sind seit 2026-10-18 nicht mehr im Katalog; wo sie
# noch installiert sind, entfernt man sie mit "claude plugin uninstall <mod>@bjoern-mods".
# Reflect, Filetree und Autopilot stecken seit 2026-10-26 im Leitstand.
PLUGINS="leitstand statistik naechste-schritte zusammenfassung visible-compact prompt-upgrade modellwahl kurzfassen sorgfalt clean-code i-have-adhd"
EINGEBAUT="reflect filetree autopilot"

# Den Namen nur als ganzes Wort suchen, nicht als Teil eines Pfads.
if claude plugin marketplace list 2>/dev/null | grep -Eq '(^|[^[:alnum:]_./\-])bjoern-mods([^[:alnum:]_./\-]|$)'; then
  echo "Hier gibt es noch den alten Katalog bjoern-mods. Erst den Umzug auf bm-mods aus UPDATE.md machen, dann install.sh noch einmal starten."
  exit 1
fi

claude plugin marketplace add "$MARKET" 2>&1 | tail -1
claude plugin marketplace update bm-mods 2>&1 | tail -1
fail=0
for p in $PLUGINS; do
  out=$(claude plugin install "$p@bm-mods" -y 2>&1 | tail -1)
  case "$out" in *Failed*|*✘*) echo "FEHLER $p: $out"; fail=1 ;; *) echo "ok     $p" ;; esac
  # install überspringt schon Installiertes; update holt dann die neue Version.
  claude plugin update "$p@bm-mods" 2>&1 | grep -q "updated from" && echo "neu    $p"
done
claude plugin enable cc-plugin-you-should-know@builtin 2>&1 | tail -1
# Neben dem Leitstand liefen sie doppelt. Entfernen löscht ihre Einstellungen und Daten, deshalb nur ein Hinweis.
installiert=$(claude plugin list 2>/dev/null)
# Alte Einträge können noch unter dem alten Katalognamen bjoern-mods stehen.
for p in $EINGEBAUT; do
  for m in bm-mods bjoern-mods; do
    case "$installiert" in *"$p@$m"*)
      echo "HINWEIS $p steckt jetzt im Leitstand und läuft sonst doppelt: claude plugin uninstall $p@$m" ;;
    esac
  done
done
echo "Fertig. In laufenden Sitzungen /reload-plugins eingeben."
exit $fail
