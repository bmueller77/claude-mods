# Danksagung

Teil 1 basiert auf reflect-mod aus BayramAnnakov/claude-reflect, MIT
(https://github.com/BayramAnnakov/claude-reflect, Ordner `mod/`, Copyright (c) 2025 Bayram Annakov).

Übernommen und angepasst wurden aus `mod/hooks/register.tsx`: die Auswahl der Nachrichten
(kurz, eigene, nicht trivial, kein Slash-Befehl, kein Geheimnis), der Klassifizierer-Prompt,
das Lesen seines Urteils, der Vergleich über Wortpaare, das Zählen von Wiederholungen, der
markierte Abschnitt in CLAUDE.md samt Markern, "remember:", "Bearbeiten" und der Abschnitt im
Systemprompt für in dieser Sitzung gespeicherte Regeln. Die Tests in `tests/lernen.test.ts`
gehen auf `mod/hooks/reflect.test.tsx` zurück. Der Lizenztext steht in `LICENSE`.

Teil 2 (Selbstkritik mit `/reflect`) ist neu geschrieben und übernimmt keinen fremden Code.
