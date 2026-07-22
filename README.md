# Studio Super

Studio Super is an open-source, static session-notes and production-handoff app. It runs entirely in the browser with no backend service, no database server, no login, and no external API calls.

## Features

- Restored v9 session dashboard layout with startup flow, Rooms, Log Mode, Project Details, and Export
- Live session logging with editable quick event and issue buttons
- Production details, crew fields, recording path, and editor handoff notes
- Pacific Time clock with a full-screen view, synchronized projected end, start, pause, and reset controls
- Font options for the interface and PDF export
- PDF and CSV editor handoff exports
- Installable PWA shell with a same-origin offline cache
- Dedicated Firebase Hosting release with strict security headers
- GitHub Pages friendly static build

## Privacy

Studio Super is a static browser app. It does not include a backend, database service, login system, remote API, third-party project integrations, or cloud sync.

The app stores working data in this site's browser storage on the current device only:

- productions, notes, deleted-note state, active production, and rooms
- saved operator/crew names and roster suggestions
- customized quick-log buttons
- theme, font, color, and dark/light mode choices

That browser storage is scoped to this site on that specific browser/device. Other users and other devices cannot reach it through Studio Super. Clearing site data or browser storage removes it from that device. PDF and CSV exports are the only files the app creates for sharing.

Studio Super uses `BroadcastChannel` only to keep multiple open tabs on the same browser in sync. It does not send data across devices or to a server.

## Development

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
```

The production site is generated into `docs/` so GitHub Pages can serve it from the main branch.

The same static build is also published to the isolated Firebase Hosting site at
`https://knight-studio-super.web.app`. The Firebase release does not add a
backend, authentication, telemetry, or remote data storage.

## Verification

```powershell
npm run verify
npm run verify:firebase
```

`verify` checks the generated identity, privacy boundary, Firebase isolation,
offline shell, tests, and production build. `verify:firebase` compares every
shipped file byte-for-byte with the live Firebase release and confirms that
source/configuration files are not public.

## License

MIT License. See [LICENSE](./LICENSE).

<sub>Contributors: Mayowa Alaketu · Connor · Eli · Albert · Charlie · Alec · Marcia · Fabiola</sub>
