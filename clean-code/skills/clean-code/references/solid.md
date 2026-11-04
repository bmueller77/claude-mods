# SOLID: ausgearbeitete Beispiele

Lade diese Datei, wenn ein Fund im Review das Design von Klassen betrifft. Wende ein Prinzip dort an, wo es Kopplung entfernt, die du heute spürst; baue keine Abstraktionen für eingebildete künftige Bedürfnisse (KISS, YAGNI).

## S: Single Responsibility Principle

**Eine Klasse oder Funktion hat einen Grund, sich zu ändern.**

Test: Beschreib die Klasse in etwa 25 Wörtern ohne "wenn", "und", "oder" und "aber".

```typescript
// ❌ BAD: Class has multiple responsibilities
class UserService {
  createUser(data) { ... }
  sendWelcomeEmail(user) { ... }      // Email responsibility
  generateReport(users) { ... }       // Reporting responsibility
  validatePassword(password) { ... }  // Validation responsibility
}

// ✅ GOOD: Separated responsibilities
class UserService {
  createUser(data) { ... }
}

class WelcomeMailer {
  send(user) { ... }
}

class UserReport {
  generate(users) { ... }
}

class PasswordPolicy {
  validate(password) { ... }
}
```

## O: Open/Closed Principle

**Offen für Erweiterung, geschlossen für Änderung.** Neues Verhalten kommt als neuer Code, nicht als Eingriff in Code, der schon funktioniert.

```typescript
// ❌ BAD: Must modify class for new payment types
class PaymentProcessor {
  process(payment) {
    if (payment.type === 'credit') { ... }
    else if (payment.type === 'paypal') { ... }
    else if (payment.type === 'crypto') { ... }  // Keep adding
  }
}

// ✅ GOOD: Extensible via new handlers
interface PaymentHandler {
  canHandle(payment): boolean;
  process(payment): void;
}

class PaymentProcessor {
  constructor(private handlers: PaymentHandler[]) {}

  process(payment) {
    const handler = this.handlers.find(h => h.canHandle(payment));
    if (!handler) throw new UnsupportedPaymentError(payment.type);
    return handler.process(payment);
  }
}
```

Nicht überdehnen: Zwei stabile Zweige in einem `if` sind in Ordnung. Den Aufbau mit Handlern führst du ein, wenn der dritte Typ kommt oder die Zweige sich ständig ändern.

## L: Liskov Substitution Principle

**Untertypen müssen ihren Basistyp ersetzen können,** ohne dass der Aufrufer es merkt.

```typescript
// ❌ BAD: Square violates Rectangle contract
class Rectangle {
  setWidth(w) { this.width = w; }
  setHeight(h) { this.height = h; }
}

class Square extends Rectangle {
  setWidth(w) { this.width = this.height = w; }  // Unexpected behavior
}

// ✅ GOOD: Separate types with correct contracts
interface Shape {
  getArea(): number;
}

class Rectangle implements Shape { ... }
class Square implements Shape { ... }
```

Warnzeichen: eine Überschreibung, die `NotSupported` wirft, ihre Eingabe ignoriert oder die Bedeutung einer Methode ändert.

## I: Interface Segregation Principle

**Viele spezifische Interfaces sind besser als ein allgemeines.** Keine Implementierung sollte Methoden liefern müssen, die sie nicht erfüllen kann.

```typescript
// ❌ BAD: Fat interface
interface Worker {
  work();
  eat();
  sleep();
  attendMeeting();
}

// ✅ GOOD: Segregated interfaces
interface Workable { work(); }
interface Eatable { eat(); }
interface Meetable { attendMeeting(); }

class Developer implements Workable, Eatable, Meetable { ... }
class Robot implements Workable { ... }  // Robots don't eat or meet
```

## D: Dependency Inversion Principle

**Von Abstraktionen abhängen, nicht von konkreten Umsetzungen.** Die übergeordnete Logik sollte nicht wissen, welche Datenbank oder welche Mail-Bibliothek darunter liegt. Reiche Abhängigkeiten herein (Dependency Injection), statt sie innen zu erzeugen.

```typescript
// ❌ BAD: Direct dependency on concrete class
class OrderService {
  private db = new MySQLDatabase();  // Tight coupling, hard to test

  saveOrder(order) {
    this.db.insert('orders', order);
  }
}

// ✅ GOOD: Depend on an injected abstraction
interface Database {
  insert(table: string, data: object): void;
}

class OrderService {
  constructor(private db: Database) {}

  saveOrder(order) {
    this.db.insert('orders', order);
  }
}
```

Nutzen: Tests können eine Attrappe im Speicher übergeben, und ein Wechsel der Umsetzung betrifft eine Stelle. Kosten: etwas Entwurfsarbeit vorab, die sich auszahlt, wenn sich Anforderungen ändern.
