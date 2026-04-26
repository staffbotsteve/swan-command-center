import { defineTool } from "./registry";
import { getPrimaryGoogleAccessToken } from "@/lib/google-tokens";

const API = "https://www.googleapis.com/calendar/v3";

async function calFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await getPrimaryGoogleAccessToken();
  const res = await fetch(API + path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`calendar ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// ─── calendar.list_events ───────────────────────────────────────────────────

export interface CalendarListEventsInput {
  calendar_id?: string;
  time_min?: string; // ISO 8601
  time_max?: string;
  max_results?: number;
  q?: string;
}

export const listEvents = defineTool<CalendarListEventsInput, unknown>({
  name: "calendar.list_events",
  description:
    "List Calendar events. Defaults: primary calendar, next 30 days, max 25 results. time_min/time_max take ISO 8601 timestamps. q is full-text search.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      calendar_id: { type: "string", description: "Defaults to 'primary'." },
      time_min: { type: "string" },
      time_max: { type: "string" },
      max_results: { type: "integer", minimum: 1, maximum: 100 },
      q: { type: "string" },
    },
    additionalProperties: false,
  },
  async handler({ calendar_id = "primary", time_min, time_max, max_results = 25, q }) {
    const params = new URLSearchParams({
      maxResults: String(max_results),
      singleEvents: "true",
      orderBy: "startTime",
    });
    params.set("timeMin", time_min ?? new Date().toISOString());
    params.set("timeMax", time_max ?? new Date(Date.now() + 30 * 86400_000).toISOString());
    if (q) params.set("q", q);
    return calFetch(`/calendars/${encodeURIComponent(calendar_id)}/events?${params}`);
  },
});

// ─── calendar.create_event ──────────────────────────────────────────────────

export interface CalendarCreateEventInput {
  calendar_id?: string;
  summary: string;
  description?: string;
  start_iso: string;
  end_iso: string;
  attendees?: string[];
  location?: string;
}

export const createEvent = defineTool<CalendarCreateEventInput, unknown>({
  name: "calendar.create_event",
  description:
    "Create a Calendar event. Defaults to primary calendar. start_iso/end_iso take ISO 8601 timestamps with timezone.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      calendar_id: { type: "string" },
      summary: { type: "string" },
      description: { type: "string" },
      start_iso: { type: "string" },
      end_iso: { type: "string" },
      attendees: { type: "array", items: { type: "string", format: "email" } },
      location: { type: "string" },
    },
    required: ["summary", "start_iso", "end_iso"],
    additionalProperties: false,
  },
  async handler({ calendar_id = "primary", summary, description, start_iso, end_iso, attendees = [], location }) {
    const body = {
      summary,
      description,
      location,
      start: { dateTime: start_iso },
      end: { dateTime: end_iso },
      attendees: attendees.map((email) => ({ email })),
    };
    return calFetch(`/calendars/${encodeURIComponent(calendar_id)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  },
});

export default listEvents;
