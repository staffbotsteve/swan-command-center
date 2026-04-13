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
  agentInstructions: Record<string, Record<string, string>>;
}

interface VaultProject {
  name: string;
  company?: string;
}

const COMPANIES = [
  { id: "SwanBill LLC", label: "SwanBill LLC" },
  { id: "Providence Fire & Rescue", label: "Providence Fire & Rescue" },
  { id: "E2S Transportation LLC", label: "E2S Transportation LLC" },
  { id: "E2S Properties AZ LLC", label: "E2S Properties AZ LLC" },
  { id: "e2s Properties LLC", label: "e2s Properties LLC" },
  { id: "e2s Hospitality CA LLC", label: "e2s Hospitality CA LLC" },
  { id: "e2s Hospitality NV LLC", label: "e2s Hospitality NV LLC" },
];

const ROLES = ["CEO", "Marketing", "Operations", "Legal", "Developer", "Research"];

const ROLE_ICONS: Record<string, string> = {
  CEO: "\u{1F451}",
  Marketing: "\u{1F4E3}",
  Operations: "\u2699\uFE0F",
  Legal: "\u2696\uFE0F",
  Developer: "\u{1F4BB}",
  Research: "\u{1F50D}",
};

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
  const [projects, setProjects] = useState<VaultProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Left sidebar selection: "global" or a company/project name
  const [selectedEntity, setSelectedEntity] = useState<string>("global");
  // Top tab: role name or global sub-tab
  const [selectedRole, setSelectedRole] = useState<string>("CEO");
  const [globalTab, setGlobalTab] = useState<string>("scheduling");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, vaultRes] = await Promise.all([
        fetch("/api/assistant"),
        fetch("/api/vault"),
      ]);
      const configData = await configRes.json();
      const vaultData = await vaultRes.json();
      if (configData.error) throw new Error(configData.error);
      // Migrate old format: convert companyInstructions to agentInstructions
      const cfg = configData.config;
      if (!cfg.agentInstructions) {
        cfg.agentInstructions = {};
      }
      setConfig(cfg);
      setSha(configData.sha ?? null);
      setProjects(vaultData.projects ?? []);
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

  function updateGlobal<K extends keyof AssistantConfig>(
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

  function getAgentInstruction(entity: string, role: string): string {
    return config?.agentInstructions?.[entity]?.[role] ?? "";
  }

  function setAgentInstruction(entity: string, role: string, value: string) {
    if (!config) return;
    setConfig({
      ...config,
      agentInstructions: {
        ...config.agentInstructions,
        [entity]: {
          ...(config.agentInstructions[entity] ?? {}),
          [role]: value,
        },
      },
    });
  }

  const isGlobal = selectedEntity === "global";

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-73px)]">
          <div className="text-muted">Loading configuration...</div>
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

  const globalTabs = [
    { id: "scheduling", label: "Scheduling" },
    { id: "travel", label: "Travel" },
    { id: "phone", label: "Phone" },
    { id: "communication", label: "Communication" },
    { id: "instructions", label: "General" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header saving={saving} saved={saved} onSave={save} />

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: entities */}
        <nav className="w-60 border-r border-card-border overflow-y-auto shrink-0">
          {/* Global settings */}
          <div className="p-3 border-b border-card-border">
            <button
              onClick={() => { setSelectedEntity("global"); setGlobalTab("scheduling"); }}
              className={`w-full text-left px-3 py-2.5 rounded text-sm transition-colors ${
                isGlobal
                  ? "bg-accent/20 text-accent font-medium"
                  : "text-foreground hover:bg-card-border/30"
              }`}
            >
              Global Settings
            </button>
          </div>

          {/* Companies */}
          <div className="p-3 border-b border-card-border">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2 px-3">
              Companies
            </div>
            <div className="space-y-0.5">
              {COMPANIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedEntity(c.id); setSelectedRole("CEO"); }}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    selectedEntity === c.id
                      ? "bg-accent/20 text-accent font-medium"
                      : "text-foreground/80 hover:bg-card-border/30"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Projects */}
          <div className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2 px-3">
              Projects
            </div>
            <div className="space-y-0.5">
              {projects.map((p) => (
                <button
                  key={p.name}
                  onClick={() => { setSelectedEntity(p.name); setSelectedRole("CEO"); }}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    selectedEntity === p.name
                      ? "bg-accent/20 text-accent font-medium"
                      : "text-foreground/80 hover:bg-card-border/30"
                  }`}
                >
                  <span>{p.name.replace(/-/g, " ")}</span>
                  {p.company && (
                    <span className="ml-2 text-[10px] text-muted">
                      {p.company.split(" ")[0]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top tabs: roles (for entities) or global sub-tabs */}
          <div className="border-b border-card-border bg-card px-4">
            <div className="flex gap-0.5 -mb-px">
              {isGlobal
                ? globalTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setGlobalTab(tab.id)}
                      className={`px-4 py-3 text-sm border-b-2 transition-colors ${
                        globalTab === tab.id
                          ? "border-accent text-accent font-medium"
                          : "border-transparent text-muted hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))
                : ROLES.map((role) => {
                    const hasContent = !!getAgentInstruction(selectedEntity, role);
                    return (
                      <button
                        key={role}
                        onClick={() => setSelectedRole(role)}
                        className={`px-4 py-3 text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
                          selectedRole === role
                            ? "border-accent text-accent font-medium"
                            : "border-transparent text-muted hover:text-foreground"
                        }`}
                      >
                        <span>{ROLE_ICONS[role]}</span>
                        {role}
                        {hasContent && (
                          <span className="w-1.5 h-1.5 bg-success rounded-full" />
                        )}
                      </button>
                    );
                  })}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
            {error && (
              <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">
                {error}
              </div>
            )}

            {isGlobal ? (
              <GlobalSettings
                config={config}
                tab={globalTab}
                onUpdate={updateGlobal}
                onSetConfig={setConfig}
              />
            ) : (
              <AgentInstructions
                entity={selectedEntity}
                role={selectedRole}
                value={getAgentInstruction(selectedEntity, selectedRole)}
                onChange={(v) => setAgentInstruction(selectedEntity, selectedRole, v)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Agent Instructions Panel ─── */

function AgentInstructions({
  entity,
  role,
  value,
  onChange,
}: {
  entity: string;
  role: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">
        {ROLE_ICONS[role]} {role} Agent
      </h2>
      <p className="text-sm text-muted mb-4">
        Instructions for the {role} agent at{" "}
        <span className="text-foreground font-medium">
          {entity.replace(/-/g, " ")}
        </span>
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={20}
        className="input-field font-mono text-sm"
        placeholder={`Enter instructions for the ${entity.replace(/-/g, " ")} ${role} agent...\n\nExamples:\n- Focus on ${role === "Marketing" ? "social media presence and SEO" : role === "Legal" ? "contract review and compliance" : role === "Developer" ? "code quality and testing" : role === "Operations" ? "process optimization" : role === "Research" ? "competitive analysis and market trends" : "strategic direction"}\n- Report weekly summaries\n- Prioritize [specific task]`}
      />
    </div>
  );
}

/* ─── Global Settings Panels ─── */

function GlobalSettings({
  config,
  tab,
  onUpdate,
  onSetConfig,
}: {
  config: AssistantConfig;
  tab: string;
  onUpdate: (section: keyof AssistantConfig, field: string, value: unknown) => void;
  onSetConfig: (c: AssistantConfig) => void;
}) {
  if (tab === "scheduling") {
    return (
      <Section title="Scheduling Preferences">
        <Field label="No calls before">
          <input type="time" value={config.scheduling.noCallsBefore}
            onChange={(e) => onUpdate("scheduling", "noCallsBefore", e.target.value)}
            className="input-field" />
        </Field>
        <Field label="No calls after">
          <input type="time" value={config.scheduling.noCallsAfter}
            onChange={(e) => onUpdate("scheduling", "noCallsAfter", e.target.value)}
            className="input-field" />
        </Field>
        <Field label="Meeting buffer (minutes)">
          <input type="number" min={0} max={60} value={config.scheduling.meetingBuffer}
            onChange={(e) => onUpdate("scheduling", "meetingBuffer", parseInt(e.target.value) || 0)}
            className="input-field w-24" />
        </Field>
        <Field label="Default meeting duration (minutes)">
          <input type="number" min={15} max={120} step={15}
            value={config.scheduling.defaultMeetingDuration}
            onChange={(e) => onUpdate("scheduling", "defaultMeetingDuration", parseInt(e.target.value) || 30)}
            className="input-field w-24" />
        </Field>
        <Field label="Timezone">
          <select value={config.scheduling.timezone}
            onChange={(e) => onUpdate("scheduling", "timezone", e.target.value)}
            className="input-field">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("America/", "").replace("Pacific/", "").replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Focus blocks (one per line)">
          <textarea value={config.scheduling.focusBlocks.join("\n")}
            onChange={(e) => onUpdate("scheduling", "focusBlocks", e.target.value.split("\n").filter(Boolean))}
            rows={4} className="input-field"
            placeholder="Mon 09:00-12:00 Deep Work&#10;Wed 14:00-16:00 Strategy" />
        </Field>
      </Section>
    );
  }

  if (tab === "travel") {
    return (
      <Section title="Travel Preferences">
        <Field label="Home airport">
          <input type="text" value={config.travel.homeAirport}
            onChange={(e) => onUpdate("travel", "homeAirport", e.target.value.toUpperCase())}
            className="input-field w-24" maxLength={4} placeholder="RNO" />
        </Field>
        <Field label="Preferred airlines (comma-separated)">
          <input type="text" value={config.travel.preferredAirlines.join(", ")}
            onChange={(e) => onUpdate("travel", "preferredAirlines",
              e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            className="input-field" placeholder="Southwest, United, Delta" />
        </Field>
        <Field label="Preferred hotel chain">
          <input type="text" value={config.travel.preferredHotel}
            onChange={(e) => onUpdate("travel", "preferredHotel", e.target.value)}
            className="input-field" placeholder="Marriott Bonvoy" />
        </Field>
        <Field label="Preferred car rental">
          <input type="text" value={config.travel.preferredCarRental}
            onChange={(e) => onUpdate("travel", "preferredCarRental", e.target.value)}
            className="input-field" placeholder="Enterprise" />
        </Field>
        <Field label="Seat preference">
          <select value={config.travel.seatPreference}
            onChange={(e) => onUpdate("travel", "seatPreference", e.target.value)}
            className="input-field">
            <option value="">No preference</option>
            <option value="window">Window</option>
            <option value="aisle">Aisle</option>
            <option value="front">Front of plane</option>
            <option value="exit-row">Exit row</option>
          </select>
        </Field>
        <div className="mt-4">
          <label className="block text-sm font-medium text-muted mb-2">Loyalty Programs</label>
          {config.travel.loyaltyPrograms.map((lp, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input type="text" value={lp.provider}
                onChange={(e) => {
                  const updated = [...config.travel.loyaltyPrograms];
                  updated[i] = { ...updated[i], provider: e.target.value };
                  onUpdate("travel", "loyaltyPrograms", updated);
                }}
                className="input-field flex-1" placeholder="Program name" />
              <input type="text" value={lp.memberId}
                onChange={(e) => {
                  const updated = [...config.travel.loyaltyPrograms];
                  updated[i] = { ...updated[i], memberId: e.target.value };
                  onUpdate("travel", "loyaltyPrograms", updated);
                }}
                className="input-field flex-1" placeholder="Member ID" />
              <button onClick={() => {
                  const updated = config.travel.loyaltyPrograms.filter((_, j) => j !== i);
                  onUpdate("travel", "loyaltyPrograms", updated);
                }}
                className="px-2 text-danger hover:text-danger/80 text-sm">X</button>
            </div>
          ))}
          <button onClick={() => onUpdate("travel", "loyaltyPrograms",
              [...config.travel.loyaltyPrograms, { provider: "", memberId: "" }])}
            className="text-xs text-accent hover:text-accent-hover">
            + Add loyalty program
          </button>
        </div>
        <Field label="Travel notes">
          <textarea value={config.travel.travelNotes}
            onChange={(e) => onUpdate("travel", "travelNotes", e.target.value)}
            rows={3} className="input-field" placeholder="Special requirements or notes..." />
        </Field>
      </Section>
    );
  }

  if (tab === "phone") {
    return (
      <Section title="Phone & Voice">
        <Field label="Greeting message">
          <textarea value={config.phone.greeting}
            onChange={(e) => onUpdate("phone", "greeting", e.target.value)}
            rows={2} className="input-field" placeholder="Hello, this is Steven Swan's office..." />
        </Field>
        <Field label="VIP contacts (one per line: Name - Phone)">
          <textarea value={config.phone.vipContacts.join("\n")}
            onChange={(e) => onUpdate("phone", "vipContacts", e.target.value.split("\n").filter(Boolean))}
            rows={4} className="input-field" placeholder="John Smith - +15551234567" />
        </Field>
        <Field label="Screening rules">
          <textarea value={config.phone.screeningRules}
            onChange={(e) => onUpdate("phone", "screeningRules", e.target.value)}
            rows={3} className="input-field" placeholder="How should the assistant handle unknown callers?" />
        </Field>
        <Field label="Voicemail message">
          <textarea value={config.phone.voicemailMessage}
            onChange={(e) => onUpdate("phone", "voicemailMessage", e.target.value)}
            rows={2} className="input-field" placeholder="Message to play if assistant can't answer..." />
        </Field>
      </Section>
    );
  }

  if (tab === "communication") {
    return (
      <Section title="Communication Style">
        <Field label="Email tone">
          <select value={config.communication.emailTone}
            onChange={(e) => onUpdate("communication", "emailTone", e.target.value)}
            className="input-field">
            <option>Professional but friendly</option>
            <option>Formal</option>
            <option>Casual</option>
            <option>Direct and concise</option>
          </select>
        </Field>
        <Field label="Signature style">
          <input type="text" value={config.communication.signatureStyle}
            onChange={(e) => onUpdate("communication", "signatureStyle", e.target.value)}
            className="input-field" placeholder="Steven Swan" />
        </Field>
        <Field label="Default reply speed">
          <select value={config.communication.defaultReplySpeed}
            onChange={(e) => onUpdate("communication", "defaultReplySpeed", e.target.value)}
            className="input-field">
            <option value="immediately">Immediately</option>
            <option value="within 1 hour">Within 1 hour</option>
            <option value="within 2 hours">Within 2 hours</option>
            <option value="within 4 hours">Within 4 hours</option>
            <option value="same day">Same day</option>
          </select>
        </Field>
      </Section>
    );
  }

  // instructions tab
  return (
    <Section title="General Instructions">
      <p className="text-sm text-muted mb-3">
        These apply across all channels and all companies/projects.
      </p>
      <textarea value={config.instructions}
        onChange={(e) => onSetConfig({ ...config, instructions: e.target.value })}
        rows={16} className="input-field"
        placeholder="Enter any instructions for your assistant...&#10;&#10;Examples:&#10;- Always confirm before booking anything over $500&#10;- Don't schedule anything on Fridays after 2pm" />
    </Section>
  );
}

/* ─── Shared UI ─── */

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
    <header className="border-b border-card-border bg-card px-6 py-4 shrink-0">
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
            <Link href="/"
              className="px-3 py-1.5 text-sm rounded text-muted hover:text-foreground hover:bg-card-border/30 transition-colors">
              Dashboard
            </Link>
            <span className="px-3 py-1.5 text-sm rounded bg-accent/20 text-accent font-medium">
              Assistant
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-success">Saved</span>
          )}
          {onSave && (
            <button onClick={onSave} disabled={saving}
              className="px-4 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white font-medium rounded transition-colors disabled:opacity-40">
              {saving ? "Saving..." : "Save to Vault"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-muted mb-1.5">{label}</label>
      {children}
    </div>
  );
}
