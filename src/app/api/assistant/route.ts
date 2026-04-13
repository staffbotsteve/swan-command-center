import { NextResponse } from "next/server";

const VAULT_REPO = "staffbotsteve/swan-vault";
const CONFIG_PATH = "02-Areas/Assistant/config.json";
const API = "https://api.github.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
  };
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(
      `${API}/repos/${VAULT_REPO}/contents/${CONFIG_PATH}`,
      { headers: headers(), cache: "no-store" }
    );
    if (res.status === 404) {
      // Return defaults if config doesn't exist yet
      return NextResponse.json({ config: getDefaults() });
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to read config: ${res.status} ${err}`);
    }
    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return NextResponse.json({ config: JSON.parse(content), sha: data.sha });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { config, sha } = body;

    if (!config) {
      return NextResponse.json({ error: "Missing config" }, { status: 400 });
    }

    const content = Buffer.from(
      JSON.stringify(config, null, 2)
    ).toString("base64");

    const payload: Record<string, string> = {
      message: `Update assistant config via Command Center`,
      content,
    };
    if (sha) payload.sha = sha;

    const res = await fetch(
      `${API}/repos/${VAULT_REPO}/contents/${CONFIG_PATH}`,
      {
        method: "PUT",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to save config: ${res.status} ${err}`);
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, sha: data.content?.sha });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function getDefaults() {
  return {
    scheduling: {
      noCallsBefore: "09:00",
      noCallsAfter: "18:00",
      meetingBuffer: 15,
      focusBlocks: [],
      defaultMeetingDuration: 30,
      timezone: "America/Los_Angeles",
    },
    travel: {
      homeAirport: "RNO",
      preferredAirlines: [],
      preferredHotel: "Marriott Bonvoy",
      preferredCarRental: "Enterprise",
      loyaltyPrograms: [
        { provider: "Marriott Bonvoy", memberId: "" },
        { provider: "Enterprise Plus", memberId: "" },
      ],
      seatPreference: "",
      travelNotes: "",
    },
    phone: {
      greeting: "Hello, this is Steven Swan's office. How can I help you?",
      vipContacts: [],
      screeningRules: "Take a message for unknown callers. Book appointments for known contacts.",
      voicemailMessage: "",
    },
    communication: {
      emailTone: "Professional but friendly",
      signatureStyle: "Steven Swan",
      defaultReplySpeed: "within 2 hours",
    },
    instructions: "",
    companyInstructions: {},
  };
}
