# Studio Super Storage Recovery Release Receipt

Date: 2026-07-20
Base release: `c3c3eb4c2f46607aaef669d806c97ae816e90544`

## Scope

- Browser storage reads and writes now fail safely when storage is blocked, unavailable, or full.
- A failed read blocks later writes for that tab, preventing unreadable saved rooms from being replaced with defaults.
- Failed writes show a dismissible, accessible warning that tells the operator to keep the tab open and export before closing.
- Browsers without `BroadcastChannel`, or where its constructor is blocked, continue in single-tab mode.
- The image-generated Studio Super wordmark and icon were preserved without modification.
- No backend, API, database, authentication, billing, DNS, or hosting changes were introduced.

## Verification

- `npm ci`: passed with zero reported vulnerabilities.
- `npm run verify:brand`: passed for all 8 generated brand assets.
- `npm run build`: passed.
- Blocked storage simulation: no page errors; app remained mounted; warning rendered; in-memory logging and CSV export succeeded.
- Read-failure simulation with writes otherwise allowed: warning rendered and the app made zero storage writes.
- Missing `BroadcastChannel` simulation: no page errors; app remained mounted.
- Critical session flow: room creation, Segment Start, Record Start, Record Stop, reload persistence, and two-tab room updates passed.
- Export flow: PDF and CSV downloads completed with production-derived filenames.
- PDF metadata: no custom metadata stream, JavaScript, forms, encryption, or user properties; output was a one-page US Letter document.
- Responsive QA: 390x844, 844x390, 768x1024, 820x1180, 1180x820, and 1440x900 all had viewport-width documents and no off-screen controls.
- Recovery warning contrast: all 10 themes in dark and light modes passed WCAG AA; minimum measured text contrast was 7.86:1.
- Public hygiene scan: no prohibited company branding references found in source, public assets, package metadata, or readable documentation.
