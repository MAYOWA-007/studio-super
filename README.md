# Studio Super

Studio Super is an open-source, static session-notes and production-handoff app. It runs entirely in the browser with no backend service, no database server, no login, and no external API calls.

## Features

- Live session logging with quick event and issue buttons
- Production details, crew fields, recording path, and editor handoff notes
- Run clock with start, pause, complete, and reset controls
- Font options for the interface and PDF export
- PDF, CSV, Markdown, single-session JSON, and workspace JSON exports
- GitHub Pages friendly static build

## Privacy

Data is stored only in the browser's local storage unless you export it. The app does not send notes to a server.

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
