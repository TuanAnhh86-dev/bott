import type { BrowserExecutionLog } from "./types";

const MAX_IN_MEMORY_EVENTS = 200;

declare global {
  // eslint-disable-next-line no-var
  var __browserLiveEvents: BrowserExecutionLog[] | undefined;
}

if (!globalThis.__browserLiveEvents) {
  globalThis.__browserLiveEvents = [];
}

export function appendLiveEvent(event: BrowserExecutionLog): void {
  const events = globalThis.__browserLiveEvents!;
  events.unshift(event);
  if (events.length > MAX_IN_MEMORY_EVENTS) {
    events.length = MAX_IN_MEMORY_EVENTS;
  }
}

export function getRecentLiveEvents(limit = 50): BrowserExecutionLog[] {
  const events = globalThis.__browserLiveEvents || [];
  return events.slice(0, Math.min(limit, MAX_IN_MEMORY_EVENTS));
}

export function clearLiveEvents(): void {
  if (globalThis.__browserLiveEvents) {
    globalThis.__browserLiveEvents.length = 0;
  }
}
