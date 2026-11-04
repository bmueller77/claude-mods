---
name: clean-code
description: 'Nutzen beim Review oder Refactoring von Code: Funktionen über 20 bis 30 Zeilen oder mit mehr als einer Aufgabe, Klassen mit vielen Verantwortlichkeiten, unklare oder nummerierte Namen (data, info, load2), magische Zahlen und String-Literale, doppelte Logik, Flag-Argumente, versteckte Seiteneffekte, tiefe Verschachtelung, lange Parameterlisten, lange Aufrufketten, verschluckte Fehler, async-Handler ohne Fehlerbehandlung und Annahmen, die nur in Kommentaren stehen. Auch vor einem PR-Review, vor dem Umbau von Legacy-Code (erst Tests), gegen Over-Engineering und für Frontend-Code (Komponenten, CSS, Barrierefreiheit, Web-Performance).'
license: MIT
metadata:
  version: "1.4.0.0"
---

# Clean Code

## Überblick

**Sauberer Code ist Code, den man ändern kann, ohne Angst, etwas kaputt zu machen.**

Er senkt die Denklast für die nächste Person, die ihn liest, auch für dich selbst in einem halben Jahr: Namen zeigen die Absicht, Funktionen tun eine Sache auf einer Abstraktionsebene, Annahmen stehen im Code und sind getestet, Fehler werden bewusst behandelt. Guter Code ist:

- **Lesbar:** Die Absicht ist klar, ohne dass man die Umsetzung durchgehen muss.
- **Vertrauenswürdig:** Er ist getestet, und die Tests prüfen die Bedeutung, nicht nur, dass er läuft.
- **Wartbar:** Wenig Kopplung, kein doppeltes Wissen, eine Änderung bleibt an einer Stelle.

Die Regeln unten sind Faustregeln, keine Gesetze. Wende sie an, wo sie die Denklast senken, und lass sie weg, wo sie sie erhöhen (siehe "Wann die Regeln nicht gelten").

## Wann nutzen

**Auslöser:**
- Funktionen über etwa 20 bis 30 Zeilen, oder solche, die sich nicht in einem Satz ohne "und" beschreiben lassen
- Namen wie `data`, `info`, `list`, `temp`, `x`, `process`, `handle`, `Manager` oder nummerierte Varianten (`load`, `load2`, `load3`)
- Magische Zahlen und String-Literale (`if (status === 2)`, `attributes.get("usernsme")`)
- Dieselbe Geschäftsregel an mehreren Stellen
- `try/catch` mit nur `console.log(e)`, oder leere catch-Blöcke
- `async`-Event-Handler oder Promise-Ketten ganz ohne Fehlerbehandlung (unbehandelte Rejections)
- Bedingungen, die drei oder mehr Ebenen tief verschachtelt sind
- 4 oder mehr Parameter, oder boolesche Flag-Argumente (`rotate(90, true)`)
- Funktionen mit dem Namen einer Abfrage, die Zustand ändern (`checkPassword()`, das eine Sitzung startet)
- Lange Aufrufketten (`order.getCustomer().getAddress().getCity()`)
- Kommentare, die das WAS erklären statt das WARUM, auskommentierter Code, TODOs ohne Ticket
- Annahmen (Einheiten, Wertebereiche, Konventionen), die nur in Kommentaren oder im Kopf einer Person stehen
- Ein Skript, das zu einem Werkzeug gewachsen ist, auf das sich andere verlassen
- Logikänderungen ohne Tests, oder Tests, die nur beweisen, dass der Code läuft

## So gehst du vor (Review-Ablauf)

1. **Prüfe zuerst das Sicherheitsnetz.** Gibt es Tests für das Verhalten, das du anfassen würdest? Wenn nicht, schlag Charakterisierungstests vor, bevor du die Struktur umbaust. Ohne Build-Schritt: reine Funktionen herauslösen und direkt testen (Node, pytest); jsdom oder Playwright nur für echtes DOM-Verhalten.
2. **Respektiere die Konventionen des Projekts** (Styleguide, Linter-Konfiguration, Sprach-Idiome). Melde nichts, was ein Formatter oder Linter findet, *wenn er auf diesem Code tatsächlich läuft*. Ist ein Ordner von Lint, Formatierung oder Typprüfung ausgenommen, melde die Lücke als einen Fund und nenne trotzdem gebündelt die echten Gefahren, die ein Linter gefunden hätte (verschattete Namen, ungenutzte Imports).
3. **Ordne nach Folgen, nicht nach Anzahl** (siehe Schweregrade). Korrektheitsfehler, Datenverlust, versteckte Annahmen, verschluckte Fehler und Sicherheit zuerst, Stil zuletzt. Prüfe die Sicherheits-Grundlagen (Injection, XSS, Secrets, Allow-Listen für URLs); für mehr Tiefe ein eigenes Security-Review.
4. **Trenne Refactoring von Verhaltensänderungen:** getrennte Commits, am besten getrennte PRs.
5. **Schlag die kleinste Änderung vor, die hilft,** mit konkretem Vorher und Nachher und dem Grund. Wo die Absicht unklar ist, frag, statt vorzuschreiben. Kritisiere den Code, nie die Person.
6. **Prüfe jeden Vorschlag, auch deine eigenen KI-Vorschläge,** am umgebenden Code und an den Tests, bevor du ihn als Lösung anbietest.
7. **Gib Code frei, der gut genug ist,** mit optionalen Vorschlägen. Blockiere nicht wegen Perfektion.
8. **Frontend-Code** (Komponenten, HTML/CSS, Templates, DOM-Skripte ohne Framework): Lade zusätzlich [references/frontend.md](references/frontend.md) für Komponenten, Vanilla-DOM, Sicherheits-Grundlagen, Styling, Barrierefreiheit, Performance, Browser-Support und Schreibrichtung. Bei reinem Backend-Code nicht.

**Diff-Review oder Audit.** Die Schritte oben gehen von einer Änderung aus, die geprüft wird. Bei einem Audit bestehenden Codes lies "durch die Änderung entstanden" als "vorhanden", ordne die Funde nach Wirkung und danach, wie oft der Code geändert wird, und liefere einen Plan in Reihenfolge (erst schnelle Korrekturen, dann Tests, dann Umbauten) statt Merge-Blockern.

---

## Teil I: Namen

**Namen zeigen die Absicht. Braucht ein Name einen Kommentar, benenne um.**

```typescript
// ❌ BAD: Unclear names
const d = new Date();
const list = getItems();
function process(x) { ... }
function load2(path) { ... }

// ✅ GOOD: Intention-revealing names
const orderCreatedAt = new Date();
const activeCustomers = getActiveCustomers();
function calculateOrderTotal(order) { ... }
function loadFromDatabase(query) { ... }
```

### Namensregeln

| Art | Konvention | Beispiel |
|-----|------------|----------|
| Boolean | Liest sich als Frage: `is`, `has`, `can`, `should` | `isActive`, `hasPermission`, `canDelete` |
| Funktion | Verb oder Verbphrase | `calculateTotal`, `sendNotification`, `loadFromCache` |
| Klasse | Substantiv im Singular, ohne Füllwörter | `Invoice`, `AddressParser`, `ShippingPolicy` |
| Sammlung | Plural oder Fachbegriff | `users`, `orderItems`, `playlist` |
| Konstante | Benannt statt nacktem Literal | `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT_MS` |

Die Schreibweise folgt Sprache und Projekt: camelCase-Funktionen in JS, TS und Java, snake_case in Python (PEP 8), PascalCase-Methoden in C#. Ein Stil pro Projekt, den der Linter durchsetzt.

### Namens-Smells

| Smell | Beispiel | Besser |
|-------|----------|--------|
| Gedankliches Übersetzen, kryptische Abkürzungen | `etd`, `t`, `p`, `genymdhms` | `elapsedTimeInDays`, `generationTimestamp` |
| Füllwörter | `UserData`, `OrderInfo`, `CustomerManager` | `User`, `Order`, ein Name, der sagt, was es tut |
| Nummerierte Varianten | `load`, `load2`, `load3` | `loadFromFile`, `loadFromDatabase`, `loadFromCache` |
| Bedeutungslose Unterscheidungen | `copyChars(a1, a2)` | `copyChars(source, target)` |
| Typ-Kodierung, Member-Präfixe | `phoneNumberString`, `m_name`, `strTitle` | `phoneNumber`, `name`, `title`; Namen ändern sich nicht, wenn Typen es tun |
| Irreführung | `accountList`, das ein Set ist; zwei lange Namen, die sich erst am Ende unterscheiden | Benenne, was es ist; mach den Unterschied früh sichtbar |
| Verb als Klasse oder Variable | `class GenerateReport` | `class SummaryReport`; Verben bleiben Funktionen vorbehalten |
| Gemischte Konventionen in einer Datei | `total_price`, `UserData`, `getuser()` | `totalPrice`, `userData`, `getUser()` |
| Gemischte natürliche Sprachen in Bezeichnern | `zeichne()` neben `renderCard()` | Eine Sprache für Bezeichner pro Projekt; Kommentare dürfen eine andere nutzen |
| Verschatten eines verbreiteten Namens | `const t = ...` in einem Modul, das `t()` für Übersetzungen nutzt | Ein genauer lokaler Name (`trigger`, `recurrenceType`) |

**Die Länge eines Namens wächst mit seinem Gültigkeitsbereich:** `i` passt in eine dreizeilige Schleife, ein Name auf Modulebene braucht ganze Wörter. Nimm Begriffe aus der Fachdomäne für Geschäftskonzepte (`AbsenceRequest`, `TravelClaim`) und Begriffe aus der Technik für technische Dinge (`JobQueue`, `RetryPolicy`).

### Gültigkeitsbereich klein halten

Deklariere eine Variable im kleinsten Bereich, der sie braucht, und so spät wie möglich: im Zweig, der sie nutzt, die Schleifenvariable im Schleifenkopf. Weniger Namen im Bereich heißt weniger im Kopf zu behalten, keine versehentliche Wiederverwendung und keine Phase, in der eine Variable existiert, aber nichts Sinnvolles enthält.

---

## Teil II: Funktionen

**Eine Sache tun, auf einer Abstraktionsebene, ohne Überraschungen.**

Test: Beschreib die Funktion in einem Satz. Braucht der Satz ein "und", teile die Funktion.

```typescript
// ❌ BAD: Validates, calculates, discounts, notifies and updates stock
function processOrder(order) {
  if (!order.items) throw new Error('No items');
  // ... 10 more lines of validation
  let total = 0;
  for (const item of order.items) total += item.price * item.quantity;
  // ... taxes, fees, 15 lines
  if (order.coupon) total = total * (1 - order.coupon.discount);
  sendEmail(order.customer.email, 'Order confirmed');
  for (const item of order.items) decrementStock(item.productId, item.quantity);
}

// ✅ GOOD: Orchestrator that reads like a table of contents
function processOrder(order) {
  validateOrder(order);
  const subtotal = calculateSubtotal(order);
  const total = applyDiscounts(order, subtotal);
  notifyCustomer(order);
  updateInventory(order);
  return { total };
}

function calculateSubtotal(order) {
  return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
```

**Eine Abstraktionsebene pro Funktion.** Von oben nach unten lesen wie eine Zeitung: Schlagzeile, dann Zusammenfassung, dann Details. Eine Funktion, die `validateOrder()` aufruft, sollte nicht nebenbei Strings zusammensetzen oder mit Array-Indizes hantieren; solche Details gehören eine Ebene tiefer.

### Richtwerte für die Länge

Länge ist ein Symptom, nicht die Krankheit. Die Quellen landen bei etwa 20 bis 30 Zeilen, am besten eine Bildschirmseite. Prüfe zuerst Verantwortlichkeiten und Abstraktionsebenen.

| Zeilen | Einschätzung | Vorgehen |
|--------|--------------|----------|
| 1-20 | Meist in Ordnung | Prüfen, ob sie noch eine Sache tut |
| 21-30 | Im Blick behalten | Teilen, wenn sie Verantwortlichkeiten oder Ebenen mischt |
| 31-50 | Wahrscheinlich zu lang | Benannte Schritte herauslösen |
| 50+ | Fast sicher mehrere Aufgaben | Umbauen, erst Tests |

Teile keine klare 10-Zeilen-Funktion in fünf 2-Zeilen-Funktionen. Zu viel Zerstückelung lässt Lesende zwischen Stellen springen, um einem einzigen Gedanken zu folgen.

### Argumente

| Anzahl | Einschätzung |
|--------|--------------|
| 0-1 | Ideal |
| 2 | In Ordnung |
| 3 | Zweimal überlegen, oft fehlt ein Konzept |
| 4+ | Braucht eine Begründung, nimm ein Parameterobjekt |

```typescript
// ❌ BAD: Positional arguments invite mix-ups
function createUser(name, email, age, address, city, country, phone, isAdmin) { ... }

// ✅ GOOD: Parameter object with named fields
interface CreateUserParams {
  name: string;
  email: string;
  address: Address;
  role: UserRole;
}
function createUser(params: CreateUserParams) { ... }
```

**Vermeide Flag-Argumente.** `rotate(90, true)` verbirgt an der Aufrufstelle, was `true` bedeutet, und das Flag zeigt, dass die Funktion zwei Dinge tut. Teile sie: `rotateLeft(90)`, `rotateRight(90)`.

### Keine versteckten Seiteneffekte (Command-Query-Separation)

Eine Funktion tut entweder etwas (Befehl) oder beantwortet etwas (Abfrage), nicht beides.

```typescript
// ❌ BAD: Name promises a check, but it also starts a session
function checkPassword(user, password) {
  if (passwordHasher.matches(user.passwordHash, password)) {
    Session.initialize();  // hidden side effect
    return true;
  }
  return false;
}

// ✅ GOOD: Query and command separated, the caller decides
if (isPasswordValid(user, password)) {
  startSession(user);
}
```

Bevorzuge explizite Ein- und Ausgaben statt globaler Variablen und verborgenem Zustand. Reine Funktionen, wo es geht, sind leichter zu testen und sicher wiederzuverwenden.

### Verschachtelung flach halten

```typescript
// ❌ BAD: Arrow code
function shipOrder(order) {
  if (order.isPaid) {
    if (order.items.length > 0) {
      if (order.address) {
        // ... actual work, three levels deep
      }
    }
  }
}

// ✅ GOOD: Guard clauses fail loudly, the happy path stays flat
function shipOrder(order) {
  if (!order.isPaid) throw new OrderNotPaidError(order.id);
  if (order.items.length === 0) throw new EmptyOrderError(order.id);
  if (!order.address) throw new MissingAddressError(order.id);
  // ... actual work
}
```

Zusammengesetzte Bedingungen werden zu benannten Prädikaten: Aus `if (account.id > 0 && account.name != null)` wird `if (account.isValid())`.

---

## Teil III: Klassen, Module und Abhängigkeiten

### Klassengröße heißt Verantwortlichkeiten, nicht Zeilen

- Zähle die öffentlichen Verantwortlichkeiten (ein Getter/Setter-Paar zählt einmal). Kleine Funktionen herauszulösen sollte private Member hinzufügen, keine öffentlichen.
- Test: Beschreib die Klasse in etwa 25 Wörtern ohne "wenn", "und", "oder" und "aber". Geht das nicht, hat sie mehr als eine Verantwortung.
- Eine Klasse über etwa 200 Zeilen ist ein Anlass, das zu prüfen, kein Urteil.
- Dieselben Tests gelten für Module und für große Closures mit gemeinsam genutztem, veränderlichem Zustand. Eine `init()`-Funktion mit Dutzenden `let`-Variablen ist eine verkleidete God Class.

### SOLID im Überblick

| Prinzip | Regel | Smell, der darauf hinweist |
|---------|-------|----------------------------|
| **S**ingle Responsibility | Ein Grund für Änderungen | Klassenname braucht "And" oder "Manager"; Methoden ohne Zusammenhang nebeneinander |
| **O**pen/Closed | Erweitern, ohne funktionierenden Code zu ändern | Wachsendes `if/else` oder `switch` auf ein Typ-Feld |
| **L**iskov Substitution | Untertypen halten den Vertrag des Basistyps | Überschreibung, die wirft, Eingaben ignoriert oder die Bedeutung ändert |
| **I**nterface Segregation | Kleine, spezifische Interfaces | Implementierungen mit leeren oder werfenden Methoden |
| **D**ependency Inversion | Von Abstraktionen abhängen, Abhängigkeiten hereinreichen | `new MySQLDatabase()` mitten in der Geschäftslogik; schwer zu testen |

Ausgearbeitete Beispiele zu jedem Prinzip: [references/solid.md](references/solid.md). Wende SOLID dort an, wo es Kopplung entfernt, die du wirklich spürst, nicht vorsorglich (KISS, YAGNI).

### Kopplung: Law of Demeter

"Sprich mit Freunden, nicht mit Fremden." Eine Methode darf Methoden ihres eigenen Objekts aufrufen, ihrer Parameter, der Objekte, die sie selbst erzeugt, und ihrer Felder, aber nicht die der Objekte, die diese zurückgeben.

```typescript
// ❌ BAD: Caller knows the whole object graph
const fee = patron.getBranch().getLendingPolicy().lateFeeFor(book);

// ✅ GOOD: Ask the object that owns the knowledge
const fee = patron.lateFeeFor(book);
```

Tausche eine Aufrufkette nicht gegen eine lange Parameterliste. Fluent Builder und reine Datenstrukturen (DTOs, Records) sind ausgenommen.

### Fremde Abhängigkeiten

- Wenige, und aktuell gehalten.
- Kapsle eine Bibliothek hinter einer eigenen kleinen Schnittstelle (`mailer.send(message)` statt Bibliotheksaufrufen überall), damit ein Update oder Wechsel an einer Stelle passiert und Tests eine Attrappe nutzen können.
- Reiche Abhängigkeiten über den Konstruktor herein, statt sie innen zu erzeugen.

### Projektstruktur

Gruppiere Code nach Feature oder Seite statt nur nach Dateityp, teile aufgeblähte Dateien in fokussierte Module und folge dem üblichen Aufbau des Frameworks. Halte Fachlogik, Berechnungen, Konfiguration, Ein- und Ausgabe und Darstellung (UI, Diagramme) auseinander. Ordner-Layouts für Frontends: [references/frontend.md](references/frontend.md).

---

## Teil IV: Code-Smells

Die Namen der Smells bleiben englisch, so stehen sie in der Literatur.

| Smell | Beschreibung | Lösung |
|-------|--------------|--------|
| Long Method | Mehrere Aufgaben oder gemischte Abstraktionsebenen | Methoden herauslösen |
| Long Parameter List | 4 oder mehr Parameter | Parameterobjekt, oder die Funktion teilen |
| Flag Argument | Ein Boolean schaltet das Verhalten um | Zwei Funktionen |
| Feature Envy | Methode nutzt die Daten einer anderen Klasse mehr als die eigenen | Methode in diese Klasse verschieben |
| Message Chain | `a.getB().getC().doD()` | Law of Demeter: fragen, nicht graben |
| God Class | Klasse, die zu viel weiß oder tut | Nach Verantwortung teilen |
| Primitive Obsession | Geld als Float, IDs als nackte Strings, Einheiten nur gedacht | Value Objects |
| Magic Number / String | Unerklärtes Literal | Benannte Konstante oder Konfiguration |
| Hardcoded Config / Secrets | URLs, Schlüssel, Grenzwerte im Code | Konfiguration oder Umgebungsvariablen; Secrets nie committen |
| Duplicate Code | Dasselbe Wissen an mehreren Stellen | In eine gemeinsame Funktion herauslösen (siehe DRY unten) |
| Speculative Generality | Abstraktionen und Erweiterungspunkte "für später" | Löschen (YAGNI) |
| Dead Code | Ungenutzter oder auskommentierter Code | Löschen, die Versionskontrolle hat die Geschichte |
| Hidden Side Effect | Abfrage, die Zustand ändert | Command-Query-Separation |
| Comments | Erklären das WAS statt das WARUM | Umbenennen oder umbauen |
| Script Sprawl | Skript, das zum Werkzeug gewachsen ist: Sonderfälle, Kopien, unausgesprochene Annahmen | In Module überführen, Tests ergänzen |

### DRY mit Augenmaß

Das Problem ist doppeltes *Wissen*, nicht Code, der nur ähnlich aussieht.

- **Dieselbe Geschäftsregel an zwei Stellen:** jetzt herauslösen. Beide Kopien müssen sich zusammen ändern, und eine wird vergessen.
- **Ähnlich aussehender Code:** auf das dritte Vorkommen warten (Rule of Three). Zwei können Zufall sein; zu frühes Abstrahieren erzeugt die falsche Abstraktion. Braucht ein gemeinsamer Helfer Flags, damit die Aufrufer auseinanderlaufen können, löse ihn wieder auf.

```typescript
// ❌ BAD: The same eligibility rule in pricing.ts and benefits.ts
if (user.age > 18 && user.age < 65) { ... }
if (user.age > 18 && user.age < 65) { ... }

// ✅ GOOD: One named rule, one place to change it
const isWorkingAge = (age: number) => age > 18 && age < 65;
```

### Magische Zahlen und Konfiguration

```typescript
// ❌ BAD: What is 1048576? What is 2?
if (data.length < 1048576) { ... }
if (status === 2) { ... }

// ✅ GOOD: The name says what it is, including the unit
const MAX_UPLOAD_SIZE_BYTES = 1024 * 1024;
if (data.length < MAX_UPLOAD_SIZE_BYTES) { ... }
if (status === OrderStatus.Active) { ... }
```

Wiederholte String-Schlüssel (`"username"`) werden Konstanten, damit ein Tippfehler ein Compile-Fehler wird statt eines stillen Fehlers. Werte, die von der Umgebung abhängen (URLs, Schlüssel, Feature-Flags, Grenzwerte), gehören in die Konfiguration oder in Umgebungsvariablen. Secrets kommen nie ins Repository.

### Feature Envy

```typescript
// ❌ BAD: InvoiceGenerator digs through Order's data
class InvoiceGenerator {
  generateTotal(order) {
    return order.items
      .filter(i => !i.cancelled)
      .reduce((sum, i) => sum + i.price * i.quantity, 0)
      * (1 - order.discount);
  }
}

// ✅ GOOD: The logic lives with the data it uses
class Order {
  calculateTotal() {
    const subtotal = this.activeItems.reduce((sum, item) => sum + item.subtotal(), 0);
    return subtotal * (1 - this.discount);
  }
}
```

---

## Teil V: Fehlerbehandlung und Annahmen

**Behandle Fehler bewusst, nicht pauschal.**

```typescript
// ❌ BAD: Swallowing errors
try {
  await processPayment();
} catch (e) {
  console.log(e);  // Error swallowed, user sees nothing
}

// ❌ BAD: Generic catch
try {
  await processPayment();
} catch (e) {
  throw new Error('Payment failed');  // Lost context and cause
}

// ✅ GOOD: Specific handling, proper propagation
try {
  await processPayment();
} catch (error) {
  if (error instanceof PaymentDeclinedError) {
    return { success: false, reason: 'payment_declined' };
  }
  if (error instanceof InsufficientFundsError) {
    return { success: false, reason: 'insufficient_funds' };
  }
  throw error;  // Re-throw unexpected errors
}
```

```typescript
// ❌ BAD: Async handler without catch - a failed save becomes an unhandled rejection
saveButton.addEventListener('click', async () => {
  await api.updateCard(card);
  dialog.close();
});

// ✅ GOOD: One wrapper reports failures of user actions
saveButton.addEventListener('click', () => runAction(async () => {
  await api.updateCard(card);
  dialog.close();
}));

async function runAction(action) {
  try {
    await action();
  } catch (error) {
    showError(t('error.saveFailed'), error);
  }
}
```

### Regeln für die Fehlerbehandlung

| Praxis | Tun | Lassen |
|--------|-----|--------|
| Catch-Umfang | Spezifische Exceptions | Alles fangen |
| Try-Umfang | Nur den Aufruf, der scheitern kann (`JSON.parse`) | Callbacks und Folgearbeit im selben `try` |
| Async | Jede Promise-Kette und jeder async-Handler endet in einer Fehlerbehandlung | `async` ohne Auffangen in Event-Handlern |
| Fehlerinfo | Stack Trace und Ursache erhalten (`new Error(msg, { cause })`) | Kontext verschlucken |
| Wiederherstellung | Behandeln, wovon du dich erholen kannst | Fangen und ignorieren |
| Weitergabe | Unerwartete Fehler neu werfen | Stilles Scheitern |
| Mechanismus | Exceptions oder Result-Typen, je nach Sprach-Idiom | Magische Rückgabecodes, `null` als Fehler |
| Aufbau | Den Versuch von der Fehlerbehandlung trennen | Wiederherstellung in die Arbeit verwoben |
| Logging | Passendes Level, mit Kontext (IDs, Ursache) | Nur `console.log(e)` |

- **Fehlerbehandlung ist eine eigene Aufgabe.** Eine Funktion tut entweder die Arbeit oder behandelt ihr Scheitern. Wiederholte Blöcke aus Fangen und Loggen werden zu einem Handler.
- **Wäge die Folgen ab.** Scheitert eine Aktion still, die jemand ausgelöst hat (Speichern, Löschen, Hochladen), ist das kritisch. Ein bewusstes, kommentiertes Auffangen um harmlose Hintergrundarbeit (eine dekorative Aktualisierung, eine optionale Abfrage) ist in Ordnung.
- **Folge dem Idiom der Sprache:** Exceptions in Java, C#, Python und TS; `Result<T, E>` in Rust; Fehlerwerte in Go. Fehlercodes werden leicht übersehen; wenn du sie brauchst, dokumentiere sie.
- **Log-Level:** ERROR braucht Aufmerksamkeit, WARN wurde behandelt, war aber unerwartet, INFO markiert fachliche Ereignisse, DEBUG ist Detail für die Fehlersuche. Schreib "Payment failed for order 4711: card declined", nicht "Error processing request". In Schleifen den Fortschritt in Abständen loggen, nicht bei jedem Durchlauf.

### Annahmen im Code festhalten

Annahmen in Kommentaren, Folien oder im Kopf einer Person gehen verloren. Annahmen im Code werden durchgesetzt und lassen sich testen.

```python
# ❌ BAD: The constraint lives in a comment
def shipping_cost(weight):  # weight in kg, must be positive
    ...

# ✅ GOOD: The unit is in the name, the constraint is enforced
def shipping_cost(weight_kg: float) -> Money:
    if weight_kg <= 0:
        raise ValueError(f"weight_kg must be > 0, got {weight_kg}")
    ...
```

- Prüfe Typen und Wertebereiche an der Grenze, damit eine Fehlbedienung sichtbar scheitert. Vertrauen ist gut, Kontrolle ist besser.
- Mach Einheiten und Konventionen in Namen oder Typen sichtbar (`timeoutMs`, `distanceMeters`, `Money`).
- Vermeide stille Standardwerte, die eine Bedeutung tragen.
- Mach ungültige Zustände unmöglich (Enums oder Union-Typen statt freier Strings und Kombinationen von Booleans).
- "Sei vorsichtig, wenn du das anfasst" ist kein Schutz. Hängt die Korrektheit davon ab, zu wissen, was man nicht anfassen darf, ist der Code von vornherein unsicher.

---

## Teil VI: Kommentare

**Guter Code erklärt sich selbst. Kommentare erklären das WARUM, nicht das WAS.**

```typescript
// ❌ BAD: Comments explain WHAT (redundant)
// Loop through items and add prices
for (const item of items) {
  total += item.price;
}

// ❌ BAD: Comment compensates for bad naming
// Check if user can access admin panel
if (u.r === 1) { ... }

// ✅ GOOD: Self-documenting code, no comment needed
if (user.canAccessAdminPanel()) { ... }

// ✅ GOOD: Comment explains WHY (business rule)
// VAT is calculated at checkout, not here, per finance requirement FR-2341
const subtotal = items.reduce((sum, i) => sum + i.price, 0);

// ✅ GOOD: Comment warns of consequences
// SimpleDateFormat is not thread-safe, so create one per call
return new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z");
```

### Wann Kommentare passen

| Passend | Unpassend |
|---------|-----------|
| Geschäftsregeln, die der Code nicht zeigt | Erklären, was der Code tut |
| Rechtliche oder Compliance-Vorgaben | Schlechte Namen ausgleichen |
| Warnung vor Folgen (Thread-Sicherheit, Kosten) | Auskommentierter Code; löschen, die Versionskontrolle hat ihn |
| Das WARUM hinter nicht offensichtlichen Entscheidungen | TODOs ohne Ticket, oder solche, die fehlende Logik verstecken (`// TODO check access` und dann `return true`) |
| Erklärung eines regulären Ausdrucks oder Datenformats | Pflicht-Doku ohne Inhalt an trivialen Gettern |
| TODO mit Ticket und Grund | Irreführende oder veraltete Kommentare |
| Doku öffentlicher APIs (JSDoc, Docstrings) | Doppelte Information |
| "Hier sind Drachen" in Legacy-Code: warum er seltsam ist, was bricht, was die richtige Lösung wäre | |

**Kommentare verrotten.** Ein veralteter Kommentar ist schlimmer als keiner, weil man ihm glaubt. Aktualisiere oder lösche Kommentare in derselben Änderung wie den Code, den sie beschreiben.

**Halte WARUM-Kommentare kurz.** Nenn den Grund in wenigen Zeilen. Wird die Geschichte hinter einer Entscheidung lang, gehört sie in die Commit-Nachricht oder die Doku. Im Code bleiben der Kern des Grundes und ein Verweis.

---

## Teil VII: Tests und Refactoring

**Sauberer Code hat Tests.** Ohne sie ist jede Änderung ein Risiko, und diese Angst friert den Code ein, bis ihn niemand mehr anfassen will.

- **Tests schützen die Bedeutung, nicht nur den Ablauf:** Invarianten, definiertes Verhalten, Randfälle, bekannte Fehlerfälle und früher bestätigte Referenzergebnisse (Regressions- oder Golden-Master-Tests). Eine Suite, die nur beweist, dass der Code läuft, ist kein Sicherheitsnetz. Der Leitfaden des CERN nennt dazu den Verlust von JPMorgan beim "London Whale" 2012: Die Tests des Risikomodells zeigten, dass der Code lief, nicht, dass seine Ergebnisse noch Sinn ergaben.
- **Schwer testbarer Code ist ein Design-Smell:** verborgener Zustand, globale Variablen, Seiteneffekte, fehlende Nahtstellen.
- **Halte die Tests grün** und lass sie beim Umbauen alle paar Minuten laufen.

**Refactoring** heißt, die Struktur zu ändern, ohne das Verhalten zu ändern.

- **Pfadfinder-Regel:** Hinterlass jede Datei, die du anfasst, ein wenig sauberer, beschränkt auf den Code, den du gerade änderst.
- **Repariere die Struktur, bevor du darauf baust.** Ist ein Feature wegen der Struktur schwer einzubauen, bau zuerst um. Neue Logik auf kaputter Struktur wird ein Kartenhaus. Bevor du unklarem Code einen Sonderfall hinzufügst, frag, ob die Struktur falsch ist.
- **Kleine Schritte:** Charakterisierungstests, eine kleine Änderung, weiter grün, Commit, wiederholen. Mische nie Refactoring und neues Verhalten in einem Commit.
- **Setze Prioritäten:** Bereiche, die oft geändert werden oder fehleranfällig sind, zuerst. Lass stabilen Code, den niemand anfasst, in Ruhe, und bau nicht um des Umbauens willen um.
- **Erst entwerfen, dann umsetzen:** Denk Randfälle und die Form der Lösung vorher durch. Flicken auf Flicken ist der Anfang von unlesbarem Code.
- **Korrekt, dann getestet, dann schnell:** Optimiere erst, wenn Messungen einen echten Engpass zeigen und Tests das Verhalten schützen.

Monster-Funktionen, Legacy-Code, Skripte, die zu Werkzeugen wurden, und Umgangsformen im Review: [references/refactoring-and-reviews.md](references/refactoring-and-reviews.md).

---

## Teil VIII: Einheitlichkeit und Werkzeuge

- **Einigt euch auf einen Styleguide,** bevor das Projekt startet (PEP 8, Airbnb JavaScript, die Google Style Guides), und **setzt ihn automatisch durch**: Formatter (Prettier, Black, ruff, clang-format), Linter (ESLint, ruff, Flake8), Typprüfung, Pre-Commit-Hooks und ein CI-Job, der bei Verstößen scheitert. Dann ist Stil kein Thema mehr im Review.
- **Richtlinien sind kein Dogma.** Eine begründete Ausnahme an einer Stelle (eine lange Zeile, die eine Formel lesbar hält) ist in Ordnung; markiere sie mit dem Ignore-Kommentar des Werkzeugs und einem Grund.
- **Schreib idiomatischen Code** für die Sprache: Comprehensions in Python, `async/await` in JavaScript, das Ownership-Modell von Rust.
- **Sauber versionieren:** kleine, fokussierte Commits mit aussagekräftigen Nachrichten; kleine PRs; nie wissentlich kaputten Code pushen; gemeinsame Branches stabil halten.

---

## Wann die Regeln nicht gelten

| Situation | Vorgehen |
|-----------|----------|
| Teilen würde eine klare Funktion zerstückeln | Lass sie. Abstrahiere nur, wenn es die Denklast senkt |
| Lust auf ein Pattern oder einen Erweiterungspunkt | KISS und YAGNI: die einfachste Lösung, die heute funktioniert. Patterns sind Werkzeuge, keine Trophäen |
| Gemessener Hot Path | Darf etwas Lesbarkeit gegen Tempo tauschen; kommentiere das WARUM. Echtzeitsysteme, Game-Engines und Handelssysteme brauchen Performance oft schon im ersten Entwurf |
| Prototyp oder Spike | Darf Tests auslassen. Schulden sind in Ordnung, wenn sie bewusst, aufgeschrieben und mit einem Plan zur Rückzahlung gemacht werden |
| Sprach-Idiom widerspricht einer allgemeinen Regel | Das Idiom gewinnt (Fehlerwerte in Go, Namen in Python) |
| Stabiler Legacy-Code, den niemand ändert | Lass ihn; bau dort um, wo du arbeitest |
| Termindruck | Mindestens: aussagekräftige Namen, keine neue Duplizierung, fokussierte Funktionen |

---

## Schweregrade

**Nach Folgen ordnen, nicht nach Zahlen.** Größenmaße (Zeilen, Parameter) sind ein Ausgangspunkt: eine Stufe höher, wenn die Größe schon Fehler verursacht, eine niedriger bei stabilem Code, den niemand ändert. Ein Maß allein macht einen Fund nie KRITISCH.

| Stufe | Anzeichen | Vorgehen |
|-------|-----------|----------|
| KRITISCH | Fehler, der Daten von Nutzern verliert oder verfälscht; Aktion, die jemand ausgelöst hat (Speichern, Löschen, Hochladen) und die still scheitert; Secrets im Code; versteckte Annahmen oder stille Standardwerte, die falsche Ergebnisse liefern können; ungetestete Änderung an kritischer Logik | Vor dem Merge beheben (Audit: zuerst beheben) |
| HOCH | Andere Korrektheitsfehler (veralteter Zustand, Ressourcen-Lecks, Race Conditions); God Class, Modul oder Closure mit gemeinsam genutztem, veränderlichem Zustand, durch die Änderung entstanden oder gewachsen (Audit: vorhanden und oft geändert); lange Methoden (über 50 Zeilen), die Verantwortlichkeiten mischen; versteckte Seiteneffekte; Feature Envy; doppelte Geschäftsregel; magische Zahlen oder String-Schlüssel, die einen Vertrag zwischen Modulen bilden | Sollte behoben werden |
| MITTEL | Methoden mit 30 bis 50 Zeilen; 4 oder mehr Parameter ohne Parameterobjekt; Flag-Argumente; unklare Namen; Aufrufketten; kleinere SOLID-Verstöße; veraltete Kommentare; TODO ohne Ticket; Code, den keine Lint-, Format- oder Typprüfung abdeckt | Beheben erwägen |
| NIEDRIG | Stilfragen, die ein laufender Formatter erledigt; Gelegenheiten für Doku; bewusstes, kommentiertes Auffangen um harmlose Hintergrundarbeit | Optional |

## Warnsignale: anhalten und umbauen

| Du willst gerade ... | Halt an und frag ... |
|----------------------|----------------------|
| einen 4. Parameter hinzufügen | Fehlt ein Konzept oder ein Parameterobjekt? |
| einen booleschen Parameter hinzufügen | Sollten das zwei Funktionen sein? |
| die 30. Zeile einer Funktion schreiben | Tut sie noch eine Sache? |
| etwas `data`, `result` oder `load2` nennen | Wofür steht es wirklich, was unterscheidet es? |
| eine nackte Zahl oder einen String-Schlüssel tippen | Braucht das einen Namen oder einen Eintrag in der Konfiguration? |
| dieselbe Regel kopieren | Wo sollte dieses Wissen wohnen? |
| `catch (e) { }` schreiben | Was soll bei einem Fehler passieren? |
| einen `async`-Event-Handler schreiben | Was sieht die Person, wenn das Promise scheitert? |
| Callbacks ins selbe `try` packen wie ein Parsen | Sollte das `try` nur den Aufruf umfassen, der scheitern kann? |
| einen Getter oder ein `check...()` schreiben, das Zustand ändert | Befehl und Abfrage trennen |
| `a.getB().getC()` schreiben | Wem sollte dieses Verhalten gehören? |
| Code, den du nicht verstehst, einen Sonderfall geben | Ist die Struktur falsch? Erst umbauen |
| ohne Tests umbauen | Erst Charakterisierungstests schreiben |
| eine Abstraktion "für später" anlegen | Gibt es heute schon einen zweiten Anwendungsfall? |
| einen Kommentar schreiben, der Code erklärt | Kann ich so umbenennen, dass es offensichtlich ist? |
| eine 4. Ebene von Bedingungen verschachteln | Gehen Guard Clauses oder ein Herauslösen? |

## Typische Ausreden

| Ausrede | Wirklichkeit |
|---------|--------------|
| "Ist doch nur eine kleine Funktion" | Heute klein, morgen groß |
| "Der Name ist im Zusammenhang klar" | Zusammenhänge ändern sich, Lesende sind verschieden |
| "Das räume ich später auf" | Später kommt selten. Sind die Schulden gewollt, schreib sie mit Ticket und Plan auf |
| "Ich logge den Fehler doch" | Stilles Scheitern führt zu Störungen im Betrieb |
| "Kommentare machen es klarer" | Gute Namen und Struktur machen es klarer; Kommentare verrotten |
| "Sind doch nur 25 Zeilen" | Länge ist ein Hinweis. Die Frage ist, ob sie eine Sache tut |
| "Aufteilen kostet Leistung" | Der Aufruf kostet fast nichts. Zerstückle aber auch keine klare 10-Zeilen-Funktion |
| "Sei einfach vorsichtig, wenn du das anfasst" | Vorsicht skaliert nicht. Halte die Bedingung im Code fest und teste sie |
| "Die Tests sind grün" | Prüfen sie, dass die Ergebnisse stimmen, oder nur, dass der Code läuft? |
| "Vielleicht brauchen wir das später" | YAGNI. Bau es, wenn es gebraucht wird |
| "Ist doch nur ein Skript" | Skripte werden zu Werkzeugen, auf die sich andere verlassen. Gib ihnen früh Struktur |
| "Das findet doch der Linter" | Nur, wenn der Linter auf diesem Ordner läuft. Sieh in seine Konfiguration |

---

Herkunft, Quellen und Änderungen: [HERKUNFT.md](HERKUNFT.md)
