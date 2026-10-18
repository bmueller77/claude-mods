# Security

## Supported versions

Only the latest release of the Leitstand gets fixes. Update with:

```
claude plugin marketplace update bjoern-mods
claude plugin update leitstand@bjoern-mods
```

## Reporting a vulnerability

Please don't open a public issue. The Leitstand grew out of GlanceFlow (Antreas-Strb): a vulnerability that GlanceFlow has too, report privately on GitHub as well, in GlanceFlow's [Security tab](https://github.com/Antreas-Strb/glanceflow/security) under **Report a vulnerability**. One that is the Leitstand's alone goes to Björn Müller directly.

Say what you found, how to reproduce it, and which version you use.

## What the Leitstand touches

- It runs inside Claude Code as a mod and makes no network requests of its own. It asks Claude, through Claude Code, for short texts such as a job's title, a handoff note or a checkpoint.
- For sounds and desktop notices, when you turn them on, it runs your computer's own sound and notification programs.
- Its history stays on your computer, in Claude Code's plugin store, for 30 days.
- It reads tool calls to show progress, and your messages to hold back one that looks like it contains a password or key. It masks emails, phone numbers, keys and card numbers on screen.
