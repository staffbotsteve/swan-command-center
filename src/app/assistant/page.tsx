"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface LoyaltyProgram {
  provider: string;
  memberId: string;
}

interface SchedulingConfig {
  noCallsBefore: string;
  noCallsAfter: string;
  meetingBuffer: number;
  focusBlocks: string[];
  defaultMeetingDuration: number;
  timezone: string;
}

interface TravelConfig {
  homeAirport: string;
  preferredAirlines: string[];
  preferredHotel: string;
  preferredCarRental: string;
  loyaltyPrograms: LoyaltyProgram[];
  seatPreference: string;
  travelNotes: string;
}

interface PhoneConfig {
  greeting: string;
  vipContacts: string[];
  screeningRules: string;
  voicemailMessage: string;
}

interface CommunicationConfig {
  emailTone: string;
  signatureStyle: string;
  defaultReplySpeed: string;
}

interface AssistantConfig {
  scheduling: SchedulingConfig;
  travel: TravelConfig;
  phone: PhoneConfig;
  communication: CommunicationConfig;
  instructions: string;
  companyInstructions: Record<string, string>;
}

const COMPANIES = [
  "SwanBill LLC",
  "Providence Fire & Rescue",
  "E2S Transportation LLC",
  "E2S Properties AZ LLC",
  "e2s Properties LLC",
  "e2s Hospitality CA LLC",
  "e2s Hospitality NV LLC",
];

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "Pacific/Honolulu",
];

export default function AssistantPage() {
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [sha, setSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("scheduling");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assistant");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConfig(data.config);
      setSha(data.sha ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, sha }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSha(data.sha);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof AssistantConfig>(
    section: K,
    field: string,
    value: unknown
  ) {
    if (!config) return;
    setConfig({
      ...config,
      [section]:
        typeof config[section] === "object" && config[section] !== null
          ? { ...(config[section] as Record<string, unknown>), [field]: value }
          : value,
    });
  }

  const tabs = [
    { id: "scheduling", label: "Scheduling", icon: "\u{1F4C5}" },
    { id: "travel", label: "Travel", icon: "\u2708\uFE0F" },
    { id: "phone", label: "Phone", icon: "\u{1F4DE}" },
    { id: "communication", label: "Communication", icon: "\u{1F4E7}" },
    { id: "instructions", label: "General Instructions", icon: "\u{1F4DD}" },
    { id: "companies", label: "Company Instructions", icon: "\u{1F3E2}" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-73px)]">
          <div className="text-muted">Loading assistant configuration...</div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-73px)]">
          <div className="text-danger">Failed to load configuration</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header saving={saving} saved={saved} onSave={save} />

      <div className="flex min-h-[calc(100vh-73px)]">
        {/* Sidebar tabs */}
        <nav className="w-56 border-r border-card-border p-3 space-y-1 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-3 py-2.5 rounded text-sm transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? "bg-accent/20 text-accent font-medium"
                  : "text-muted hover:text-foreground hover:bg-card-border/30"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 p-6 max-w-3xl">
          {error && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">
              {error}
            </div>
          )}

          {activeTab === "scheduling" && (
            <Section title="Scheduling Preferences">
              <Field label="No calls before">
                <input
                  type="time"
                  value={config.scheduling.noCallsBefore}
                  onChange={(e) =>
                    update("scheduling", "noCallsBefore", e.target.value)
                  }
                  className="input-field"
                />
              </Field>
              <Field label="No calls after">
                <input
                  type="time"
                  value={config.scheduling.noCallsAfter}
                  onChange={(e) =>
                    update("scheduling", "noCallsAfter", e.target.value)
                  }
                  className="input-field"
                />
              </Field>
              <Field label="Meeting buffer (minutes between meetings)">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={config.scheduling.meetingBuffer}
                  onChange={(e) =>
                    update(
                      "scheduling",
                      "meetingBuffer",
                      parseInt(e.target.value) || 0
                    )
                  }
                  className="input-field w-24"
                />
              </Field>
              <Field label="Default meeting duration (minutes)">
                <input
                  type="number"
                  min={15}
                  max={120}
                  step={15}
                  value={config.scheduling.defaultMeetingDuration}
                  onChange={(e) =>
                    update(
                      "scheduling",
                      "defaultMeetingDuration",
                      parseInt(e.target.value) || 30
                    )
                  }
                  className="input-field w-24"
                />
              </Field>
              <Field label="Timezone">
                <select
                  value={config.scheduling.timezone}
                  onChange={(e) =>
                    update("scheduling", "timezone", e.target.value)
                  }
                  className="input-field"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace("America/", "").replace("Pacific/", "").replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Focus blocks (one per line, e.g. 'Mon 09:00-12:00 Deep Work')">
                <textarea
                  value={config.scheduling.focusBlocks.join("\n")}
                  onChange={(e) =>
                    update(
                      "scheduling",
                      "focusBlocks",
                      e.target.value.split("\n").filter(Boolean)
                    )
                  }
                  rows={4}
                  className="input-field"
                  placeholder="Mon 09:00-12:00 Deep Work&#10;Wed 14:00-16:00 Strategy"
                />
              </Field>
            </Section>
          )}

          {activeTab === "travel" && (
            <Section title="Travel Preferences">
              <Field label="Home airport">
                <input
                  type="text"
                  value={config.travel.homeAirport}
                  onChange={(e) =>
                    update("travel", "homeAirport", e.target.value.toUpperCase())
                  }
                  className="input-field w-24"
                  maxLength={4}
                  placeholder="RNO"
                />
              </Field>
              <Field label="Preferred airlines (comma-separated)">
                <input
                  type="text"
                  value={config.travel.preferredAirlines.join(", ")}
                  onChange={(e) =>
                    update(
                      "travel",
                      "preferredAirlines",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                  className="input-field"
                  placeholder="Southwest, United, Delta"
                />
              </Field>
              <Field label="Preferred hotel chain">
                <input
                  type="text"
                  value={config.travel.preferredHotel}
                  onChange={(e) =>
                    update("travel", "preferredHotel", e.target.value)
                  }
                  className="input-field"
                  placeholder="Marriott Bonvoy"
                />
              </Field>
              <Field label="Preferred car rental">
                <input
                  type="text"
                  value={config.travel.preferredCarRental}
                  onChange={(e) =>
                    update("travel", "preferredCarRental", e.target.value)
                  }
                  className="input-field"
                  placeholder="Enterprise"
                />
              </Field>
              <Field label="Seat preference">
                <select
                  value={config.travel.seatPreference}
                  onChange={(e) =>
                    update("travel", "seatPreference", e.target.value)
                  }
                  className="input-field"
                >
                  <option value="">No preference</option>
                  <option value="window">Window</option>
                  <option value="aisle">Aisle</option>
                  <option value="front">Front of plane</option>
                  <option value="exit-row">Exit row</option>
                </select>
              </Field>

              <div className="mt-4">
                <label className="block text-sm font-medium text-muted mb-2">
                  Loyalty Programs
                </label>
                {config.travel.loyaltyPrograms.map((lp, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={lp.provider}
                      onChange={(e) => {
                        const updated = [...config.travel.loyaltyPrograms];
                        updated[i] = { ...updated[i], provider: e.target.value };
                        update("travel", "loyaltyPrograms", updated);
                      }}
                      className="input-field flex-1"
                      placeholder="Program name"
                    />
                    <input
                      type="text"
                      value={lp.memberId}
                      onChange={(e) => {
                        const updated = [...config.travel.loyaltyPrograms];
                        updated[i] = { ...updated[i], memberId: e.target.value };
                        update("travel", "loyaltyPrograms", updated);
                      }}
                      className="input-field flex-1"
                      placeholder="Member ID"
                    />
                    <button
                      onClick={() => {
                        const updated = config.travel.loyaltyPrograms.filter(
                          (_, j) => j !== i
                        );
                        update("travel", "loyaltyPrograms", updated);
                      }}
                      className="px-2 text-danger hover:text-danger/80 text-sm"
                    >
                      X
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    update("travel", "loyaltyPrograms", [
                      ...config.travel.loyaltyPrograms,
                      { provider: "", memberId: "" },
                    ])
                  }
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  + Add loyalty program
                </button>
              </div>

              <Field label="Travel notes">
                <textarea
                  value={config.travel.travelNotes}
                  onChange={(e) =>
                    update("travel", "travelNotes", e.target.value)
                  }
                  rows={3}
                  className="input-field"
                  placeholder="Any special requirements, preferences, or notes..."
                />
              </Field>
            </Section>
          )}

          {activeTab === "phone" && (
            <Section title="Phone & Voice">
              <Field label="Greeting message">
                <textarea
                  value={config.phone.greeting}
                  onChange={(e) =>
                    update("phone", "greeting", e.target.value)
                  }
                  rows={2}
                  className="input-field"
                  placeholder="Hello, this is Steven Swan's office..."
                />
              </Field>
              <Field label="VIP contacts (one per line: Name - Phone)">
                <textarea
                  value={config.phone.vipContacts.join("\n")}
                  onChange={(e) =>
                    update(
                      "phone",
                      "vipContacts",
                      e.target.value.split("\n").filter(Boolean)
                    )
                  }
                  rows={4}
                  className="input-field"
                  placeholder="John Smith - +15551234567&#10;Jane Doe - +15559876543"
                />
              </Field>
              <Field label="Screening rules">
                <textarea
                  value={config.phone.screeningRules}
                  onChange={(e) =>
                    update("phone", "screeningRules", e.target.value)
                  }
                  rows={3}
                  className="input-field"
                  placeholder="How should the assistant handle unknown callers?"
                />
              </Field>
              <Field label="Voicemail message">
                <textarea
                  value={config.phone.voicemailMessage}
                  onChange={(e) =>
                    update("phone", "voicemailMessage", e.target.value)
                  }
                  rows={2}
                  className="input-field"
                  placeholder="Message to play if assistant can't answer..."
                />
              </Field>
            </Section>
          )}

          {activeTab === "communication" && (
            <Section title="Communication Style">
              <Field label="Email tone">
                <select
                  value={config.communication.emailTone}
                  onChange={(e) =>
                    update("communication", "emailTone", e.target.value)
                  }
                  className="input-field"
                >
                  <option>Professional but friendly</option>
                  <option>Formal</option>
                  <option>Casual</option>
                  <option>Direct and concise</option>
                </select>
              </Field>
              <Field label="Signature style">
                <input
                  type="text"
                  value={config.communication.signatureStyle}
                  onChange={(e) =>
                    update("communication", "signatureStyle", e.target.value)
                  }
                  className="input-field"
                  placeholder="Steven Swan"
                />
              </Field>
              <Field label="Default reply speed">
                <select
                  value={config.communication.defaultReplySpeed}
                  onChange={(e) =>
                    update("communication", "defaultReplySpeed", e.target.value)
                  }
                  className="input-field"
                >
                  <option value="immediately">Immediately</option>
                  <option value="within 1 hour">Within 1 hour</option>
                  <option value="within 2 hours">Within 2 hours</option>
                  <option value="within 4 hours">Within 4 hours</option>
                  <option value="same day">Same day</option>
                </select>
              </Field>
            </Section>
          )}

          {activeTab === "instructions" && (
            <Section title="General Instructions">
              <p className="text-sm text-muted mb-3">
                Free-form instructions for your assistant. These apply across
                all channels (iMessage, phone, Slack) and all companies.
              </p>
              <textarea
                value={config.instructions}
                onChange={(e) =>
                  setConfig({ ...config, instructions: e.target.value })
                }
                rows={16}
                className="input-field"
                placeholder="Enter any instructions for your assistant...&#10;&#10;Examples:&#10;- Always confirm before booking anything over $500&#10;- My wife's name is [name], always prioritize her calls&#10;- I'm currently focused on Project Falcon launch&#10;- Don't schedule anything on Fridays after 2pm"
              />
            </Section>
          )}

          {activeTab === "companies" && (
            <Section title="Company-Specific Instructions">
              <p className="text-sm text-muted mb-4">
                Instructions specific to each company. These will be available
                to all agents within that company.
              </p>
              {COMPANIES.map((company) => (
                <div key={company} className="mb-6">
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    {company}
                  </label>
                  <textarea
                    value={config.companyInstructions[company] ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        companyInstructions: {
                          ...config.companyInstructions,
                          [company]: e.target.value,
                        },
                      })
                    }
                    rows={4}
                    className="input-field"
                    placeholder={`Instructions for ${company} agents...`}
                  />
                </div>
              ))}
            </Section>
          )}
        </main>
      </div>
    </div>
  );
}

function Header({
  saving,
  saved,
  onSave,
}: {
  saving?: boolean;
  saved?: boolean;
  onSave?: () => void;
}) {
  return (
    <header className="border-b border-card-border bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Swan Command Center
            </h1>
            <p className="text-sm text-muted mt-0.5">
              Assistant Configuration
            </p>
          </div>
          <nav className="flex items-center gap-1 ml-4">
            <Link
              href="/"
              className="px-3 py-1.5 text-sm rounded text-muted hover:text-foreground hover:bg-card-border/30 transition-colors"
            >
              Dashboard
            </Link>
            <span className="px-3 py-1.5 text-sm rounded bg-accent/20 text-accent font-medium">
              Assistant
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-success flex items-center gap-1">
              <span>Saved</span>
            </span>
          )}
          {onSave && (
            <button
              onClick={onSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white font-medium rounded transition-colors disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save to Vault"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-muted mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
