# Frontend-Code: Komponenten, DOM, Sicherheit, Styling, Barrierefreiheit, Performance

Lade diese Datei, wenn du UI-Code prüfst oder schreibst: Komponenten (React, Vue, Angular, Web Components), reines JavaScript, das das DOM steuert, HTML, CSS, Themes und Templates. Alles aus SKILL.md gilt weiter; hier steht, was nur für Frontends gilt.

**Kläre zuerst die echte Zielplattform:** öffentliche Website, Intranet-App, Kiosk-Anzeige, Android-WebView, iframe in einer anderen App. Sie entscheidet, welche Regeln zu Performance, Browsern und Barrierefreiheit zählen (siehe "Wann die Frontend-Regeln nicht gelten").

## Komponenten

- **Eine Aufgabe pro Komponente.** Halte Komponenten und ihre Funktionen klein.
- **Zustand bleibt lokal,** solange ihn nicht Props oder Context teilen. Heb ihn nur so weit an, wie die Komponenten sitzen, die ihn brauchen.
- **Wiederverwenden vor Neubauen.** Löse wiederkehrende UI-Muster in gemeinsame Komponenten heraus, und baue neue Module aus den Basiskomponenten des Design-Systems oder der Komponentenbibliothek statt aus Einzelstücken neben der Bibliothek.
- **Datenzugriff und Geschäftslogik gehören nicht in darstellende Komponenten.** API-Aufrufe und Regeln gehören in Services, wiederverwendbare zustandsbehaftete Logik in Hooks oder Composables.
- **Teste Komponenten und ihre Logik mit Unit-Tests.**

```tsx
// ❌ BAD: Component fetches, filters, sorts and renders
function OrderList() {
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    fetch('/api/orders')
      .then(response => response.json())
      .then(data => setOrders(data.filter(o => !o.cancelled).sort(byDate)));
  }, []);
  return <ul>{orders.map(o => <li key={o.id}>{o.total}</li>)}</ul>;
}

// ✅ GOOD: Data access in a hook, the component only renders
function OrderList() {
  const orders = useActiveOrders();
  return (
    <ul>
      {orders.map(order => <OrderRow key={order.id} order={order} />)}
    </ul>
  );
}
```

## Vanilla-JavaScript und DOM ohne Framework

Ohne Framework räumt niemand für dich auf. Die meisten echten Fehler in solchem Code kommen von Zustand und Ressourcen, die ein Neuzeichnen oder einen Dialog überleben.

- **Gib frei, was das letzte Neuzeichnen angelegt hat.** Instanzen von Bibliotheken (Drag-and-drop, Diagramme, Editoren) brauchen `destroy()`, Listener müssen entfernt werden (mit einem `AbortController`-Signal ist das ein Aufruf), oder du nutzt Event-Delegation an einem festen Container. Sonst leckt jedes Neuzeichnen Speicher, und Seiten, die lange offen bleiben (Kiosk, Dashboard), werden über Tage langsamer.
- **Registriere Handler einmal.** Ein `init()`, das man gefahrlos zweimal aufrufen kann, ist besser als verstreute Schutz-Flags wie `el._bound = true`.
- **Ein Einstieg pro Dialog-Modus.** Bedient ein Dialog mehrere Modi (neu, bearbeiten, kopieren, Vorlage), setzt ein einziges `openEditor({ mode, ... })` den ganzen Modus-Zustand zurück, und das `close`-Ereignis setzt ihn noch einmal zurück. Ein Modus-Flag, das vom letzten Öffnen übrig ist, ändert still, was das nächste Speichern tut.
- **Geschäftsregeln raus aus dem Zeichencode.** Filtern, Sortieren und Grenzwerte werden reine Funktionen (`visibleCards(board, column, filters)`), die sich ohne DOM unter Node testen lassen.
- **Module dürfen beim Import nichts tun.** Kein Zugriff auf DOM, Storage oder `matchMedia` beim Laden des Moduls; das gehört in `init()`. Dann lassen sich Module in Tests importieren, und ein Fehler landet in der Fehlerbehandlung der App statt in einer Seite, die bei "Laden..." hängen bleibt.
- **Kapsle den Browser-Speicher.** `localStorage` kann werfen (privater Modus, iframe in einer Sandbox, voller Speicher). Ein kleiner Helfer mit try/catch ersetzt verstreute Kopien.
- **Gemeinsame Helfer wohnen in einem Modul** (`dom.js`, `dates.js`), statt in jeder Datei neu definiert zu werden.

```js
// ❌ BAD: Each render creates new instances and never releases the old ones
function renderBoard(board) {
  container.textContent = '';
  for (const column of board.columns) {
    Sortable.create(renderColumn(column), { onEnd: moveCard });
  }
}

// ✅ GOOD: Release what the previous render created
let sortables = [];
function renderBoard(board) {
  sortables.forEach(sortable => sortable.destroy());
  sortables = [];
  container.textContent = '';
  for (const column of board.columns) {
    sortables.push(Sortable.create(renderColumn(column), { onEnd: moveCard }));
  }
}
```

## Sicherheits-Grundlagen

Ein Clean-Code-Review sollte diese Punkte nicht überspringen; für mehr Tiefe ein eigenes Security-Review.

- **Inhalte von Nutzern mit `textContent` einfügen, nicht mit `innerHTML`.** Wo HTML nötig ist (gerendertes Markdown), nach dem Rendern bereinigen, etwa mit DOMPurify.
- **Erlaube nur bestimmte URL-Schemata** für Links, die Nutzer eingeben (`https:`, `http:`, `mailto:`), damit `javascript:` nie in einem `href` landet.
- **Setze eine Content Security Policy,** am besten ohne `unsafe-inline`.
- **Keine Secrets im Frontend-Code.** Alles, was an den Browser geht, ist öffentlich.

## Styling

- **Basis-Styles erweitern, nicht neu schreiben.** Überschreibe nichts ohne klaren Grund; ein Krieg der `!important` zeigt, dass du gegen das System arbeitest.
- **Eine Quelle für Werte, die synchron bleiben müssen:** Markenfarben, Breakpoints, die CSS und JavaScript beide nutzen, Farben, die JavaScript für Berechnungen braucht. Leg sie als Design-Tokens oder CSS Custom Properties ab und lies sie in JS mit `getComputedStyle`, statt sie zu kopieren.
- **Mit einem Design-System nimm seine Tokens** für Farben, Abstände und Breakpoints. In handgeschriebenem CSS ohne Design-System ist ein einzelnes `padding: 6px 12px` in Ordnung.
- **Passe Komponenten von Drittanbietern an** das Design-System an, und bring keine Komponenten hinein, die die visuelle Sprache brechen.
- **Standard-HTML und modernes CSS** statt browserspezifischer Tricks.

```css
/* ❌ BAD: Magic values overriding the base button */
.checkout-button {
  background: #1a73e8 !important;
  padding: 13px 22px;
}

/* ✅ GOOD: A modifier that extends the base button with tokens */
.button--checkout {
  background: var(--color-primary);
  padding: var(--space-3) var(--space-5);
}
```

## Barrierefreiheit und Eingabe

- **Jedes Bedienelement ist per Tastatur erreichbar und bedienbar** (Tab, Enter, Leertaste). Ein `span` oder `div` mit Klick-Handler ist es nicht; nimm einen `<button>`.
- **Drag-and-drop braucht eine Alternative:** Buttons zum Verschieben oder Tastenkürzel (WCAG 2.1.1 Tastatur, 2.5.7 Ziehbewegungen).
- **Der Fokus ist sichtbar** und gut zu unterscheiden. Entferne den Fokusrahmen nie ohne Ersatz.
- **Buttons nur mit Icon brauchen einen zugänglichen Namen** (`aria-label`). Ein `title` allein reicht nicht zuverlässig, und ein Screenreader liest "×" sonst als "Malzeichen" vor.
- **Touch-Ziele:** mindestens 24x24 CSS-Pixel (WCAG 2.2 AA, 2.5.8). 44x44 px ist die erweiterte Stufe (2.5.5 AAA) und die Vorgabe von Apple. Folge dem dokumentierten Ziel des Projekts, wenn es mindestens AA erfüllt.
- **Nichts, das nur beim Überfahren mit der Maus funktioniert.** Wer Tastatur, Screenreader oder Touch nutzt, kann nicht hovern.
- **Zuerst semantisches HTML:** native `<button>`, `<a>`, `<nav>`, `<label>`, `<dialog>`. ARIA-Rollen und -Attribute nur dort ins Markup, wo kein natives Element die Bedeutung trägt.

```html
<!-- ❌ BAD: Not focusable, no keyboard support, no role -->
<div class="btn" onclick="save()">Save</div>

<!-- ✅ GOOD: Native element brings focus, keyboard and role for free -->
<button type="button" class="button" onclick="save()">Save</button>
```

## Performance

- **Lade nur, was gebraucht wird:** Bilder und Skripte, die nicht sofort nötig sind, erst bei Bedarf.
- **Moderne Bildformate** wie WebP oder AVIF.
- **Komprimiere Dateien** mit gzip oder Brotli; setze sinnvolle Cache-Header; nutze für öffentliche Seiten ein CDN.
- **Hinterfrage große JavaScript-Bibliotheken,** die für kleine Aufgaben geladen werden.
- **Halte die Oberfläche reaktionsschnell:** Langsame Arbeit asynchron erledigen, teure Berechnungen zwischenspeichern, gleiche Anfragen nicht wiederholen (einmal holen und das Ergebnis an alle weitergeben, die es brauchen).
- **Erst messen, dann optimieren, und zwar auf dem echten Ziel:** Für öffentliche Seiten Lighthouse mit 3G/4G-Simulation, Drosselung in den DevTools und WebPageTest; für Kiosk und Dashboards, die tagelang offen sind, das Wachstum des Speichers über die Zeit und die Kosten des Neuzeichnens.

## Browser- und Geräte-Support

- **Leg eine Support-Matrix aus der echten Zielplattform fest und teste dagegen.** Für eine öffentliche Seite sind das meist die aktuelle und die vorige Hauptversion von Chrome, Edge und Firefox, die letzten zwei Safari-Versionen und eine schrittweise Verschlechterung für ältere Browser. Für eine Intranet- oder Kiosk-App sind es die Geräte, die wirklich im Einsatz sind (Kiosk-Browser, Version der Android-WebView).
- **Sperre nie Nutzer über eine Browser-Erkennung aus.** Prüfe stattdessen, ob eine Funktion vorhanden ist, und biete einen Rückfall an.
- **Mobile-first für neue Stylesheets:** Für den kleinsten Bildschirm bauen, dann Media Queries für größere ergänzen.

```css
/* Feature detection with a fallback instead of browser sniffing */
@supports not (display: grid) {
  .layout { display: block; }
}
```

## Sprache und Schreibrichtung

- **Gib die Sprache der Seite** am Wurzelelement an: `<html lang="de">`, und zieh sie mit, wenn die Person die Sprache wechselt. Browser, Screenreader und Suchmaschinen verlassen sich darauf.
- **Jede unterstützte Sprache funktioniert auf jeder Seite,** nicht nur auf den wichtigsten.
- **Wenn du eine Sprache mit Schrift von rechts nach links unterstützt:** Setze `dir="rtl"` und spiegle Layout und Navigation. Logische CSS-Eigenschaften (`margin-inline-start` statt `margin-left`) spiegeln, ohne dass Styles doppelt nötig sind. Die Schriften müssen jedes unterstützte Schriftsystem abdecken (etwa Latein und Arabisch); prüfe Ausrichtung und Abstände in beide Richtungen.

## Projektstruktur

Folge den Konventionen des Frameworks. Ein verbreiteter Aufbau für React oder Vue:

```
src/
├── components/   # Reusable UI elements
├── pages/        # Route-level components
├── services/     # API calls and business logic
├── hooks/        # Reusable stateful logic
├── assets/       # Images, fonts, icons
├── types/        # TypeScript definitions
└── utils/        # Utility functions
```

Oder nach Feature gruppiert, mit Komponente, Styles und Tests jeder Seite nebeneinander (`pages/home/Home.jsx`, `home.css`, `home.test.js`). Bei CMS-Themes folge der Struktur des CMS und leg statische Dateien (CSS, JS, Schriften, Bilder, Icons) unter einen Ordner `assets/`. Wähle einen Aufbau und bleib dabei.

## Wann die Frontend-Regeln nicht gelten

| Situation | Vorgehen |
|-----------|----------|
| Handgeschriebenes CSS ohne Design-System | Tokens nur für Werte, die synchron bleiben müssen, nicht für jedes Padding |
| Funktionierendes Stylesheet, desktop-first gebaut | Nicht auf mobile-first umschreiben; mobile-first gilt für neue Stylesheets |
| Keine Sprache mit Schrift von rechts nach links | Die RTL-Regeln überspringen |
| Intranet-, Kiosk- oder WebView-App | CDN- und 3G-Ratschläge überspringen; auf den Zielgeräten messen |
| Projekt dokumentiert ein eigenes Ziel für Barrierefreiheit | Ihm folgen, solange es mindestens WCAG AA erfüllt |

## Zusätzliche Schweregrade für Frontends

| Stufe | Anzeichen |
|-------|-----------|
| HOCH | Bedienelement nicht per Tastatur erreichbar oder bedienbar; unsichtbarer Fokus; Button nur mit Icon ohne zugänglichen Namen; Bedienung nur per Hover; Nutzer durch Browser-Erkennung ausgesperrt; Inhalte von Nutzern ohne Bereinigung per `innerHTML` eingefügt; Speicherleck bei jedem Neuzeichnen einer Seite, die lange offen bleibt; API-Aufrufe oder Geschäftsregeln in darstellenden Komponenten. Wo Barrierefreiheit gesetzlich vorgeschrieben ist (öffentliche Stellen, European Accessibility Act), gelten Mängel daran als KRITISCH |
| MITTEL | Werte, die synchron bleiben müssen, doppelt in CSS und JS (Farben, Breakpoints); Überschreiben statt Erweitern; Touch-Ziele unter dem Ziel des Projekts (Standard 24x24 px); fehlendes `lang`-Attribut oder eines, das einem Sprachwechsel nicht folgt; Zugriff auf den Browser-Speicher ohne Schutz; Seiteneffekte beim Laden eines Moduls; große Bibliothek für eine kleine Aufgabe |
| NIEDRIG | Einzelne feste Werte in handgeschriebenem CSS; Bildformate, Lazy Loading und Caching, solange Messungen sie nicht als Problem zeigen |
