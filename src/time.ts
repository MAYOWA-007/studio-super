function usesTwelveHourClock(timeZone: string) {
  return timeZone === "America/Los_Angeles" || timeZone === "America/New_York";
}

export function nowUtcIso() {
  return new Date().toISOString();
}

export function formatZonedTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: usesTwelveHourClock(timeZone),
    timeZone,
    timeZoneName: "short"
  }).format(new Date(iso));
}

export function formatZonedDateTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: usesTwelveHourClock(timeZone),
    timeZone,
    timeZoneName: "short"
  }).format(new Date(iso));
}

export function buildTimeColumns(iso: string) {
  return {
    sanFrancisco: formatZonedDateTime(iso, "America/Los_Angeles")
  };
}

export function compactDate(date: string) {
  if (!date) {
    return "Unscheduled";
  }

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}
