# Security Policy

TABS is a small ledger app — it never holds money or payment credentials, but
it does store names, emails, phone numbers, and friend relationships, so we
take reports about data exposure seriously.

## Reporting a Vulnerability

Please report vulnerabilities privately — do **not** open a public issue with
exploit details.

- Preferred: use GitHub's private vulnerability reporting on this repository
  (**Security → Report a vulnerability**).
- Include what you found, the affected file/endpoint (e.g. a database rule or
  Cloud Function), and steps to reproduce.

You can expect an acknowledgement within a week. Once a fix ships, we're happy
to credit you in the release notes if you'd like.

## Scope

- The web app (this repository) at `tabsonfriends.com`
- The Firebase Realtime Database rules (`database.rules.json`)
- The Cloud Functions (`functions/`)
- The iOS wrapper app (`ios/`) and Expo app (`mobile/`)

The Firebase web API key in the client code is intentionally public (that is
how Firebase web apps work); reports about its presence alone are not
considered vulnerabilities. Reports about what that key *allows* (rule
bypasses, cross-user reads/writes) absolutely are.
