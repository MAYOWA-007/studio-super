# Studio Super

Studio Super is an open-source, static session-notes and production-handoff app. It runs entirely in the browser with no backend service, no database server, no login, and no external API calls.

## Features

- Restored v9 session dashboard layout with startup flow, Rooms, Log Mode, Project Details, and Export
- Live session logging with editable quick event and issue buttons
- Production details, crew fields, recording path, and editor handoff notes
- Target Time clock with start, pause, reset, projected end, and time-zone controls
- Font options for the interface and PDF export
- PDF and CSV editor handoff exports
- GitHub Pages friendly static build

## Privacy

Data stays in the browser unless you export it. The app does not send notes to a server.

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

## License

MIT
