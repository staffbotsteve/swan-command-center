import { describe, it, expect } from "vitest";
import { route } from "./index";
import type { IncomingMessage } from "./rules";

function msg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    channel: "telegram",
    external_id: "chat_123",
    sender: "sactoswan",
    text: "",
    ...overrides,
  };
}

describe("route — rule 1: explicit mention", () => {
  it("routes @research to research", () => {
    const decision = route(msg({ text: "@research summarize Q2 hospitality" }));
    expect(decision.agent).toBe("research");
    expect(decision.rule).toBe("explicit_mention");
    expect(decision.confidence).toBe(1.0);
  });

  it("is case insensitive", () => {
    const decision = route(msg({ text: "hey @Research, look at this" }));
    expect(decision.agent).toBe("research");
    expect(decision.rule).toBe("explicit_mention");
  });

  it("ignores unknown role mentions and falls through", () => {
    const decision = route(msg({ text: "hey @marketing do something" }));
    expect(decision.rule).toBe("fallback_main");
  });

  it("ignores mid-word @ (emails, handles)", () => {
    const decision = route(msg({ text: "email me@research.example" }));
    expect(decision.rule).toBe("fallback_main");
  });
});

describe("route — rule 2: slash command", () => {
  it("routes /ops to ops", () => {
    const decision = route(msg({ text: "/ops reconcile QB" }));
    expect(decision.agent).toBe("ops");
    expect(decision.rule).toBe("slash_command");
    expect(decision.confidence).toBe(0.9);
  });

  it("routes /dispatch <role> to that role", () => {
    const decision = route(msg({ text: "/dispatch legal review this MSA" }));
    expect(decision.agent).toBe("legal");
    expect(decision.rule).toBe("slash_command");
    expect(decision.confidence).toBe(0.95);
  });

  it("routes /agent <role> same as /dispatch", () => {
    const decision = route(msg({ text: "/agent content draft a LinkedIn post" }));
    expect(decision.agent).toBe("content");
  });

  it("ignores unknown slash role and falls through", () => {
    const decision = route(msg({ text: "/marketing run a campaign" }));
    expect(decision.rule).toBe("fallback_main");
  });
});

describe("route — rule 3: channel hint", () => {
  it("routes Slack #research channel id to research", () => {
    const decision = route(
      msg({ channel: "slack", external_id: "C0RESEARCH" }),
      { channelHints: { C0RESEARCH: "research" } }
    );
    expect(decision.agent).toBe("research");
    expect(decision.rule).toBe("channel_hint");
    expect(decision.confidence).toBe(0.75);
  });

  it("does not fire when no map entry", () => {
    const decision = route(
      msg({ channel: "slack", external_id: "C0OTHER" }),
      { channelHints: { C0RESEARCH: "research" } }
    );
    expect(decision.rule).toBe("fallback_main");
  });

  it("loses to an explicit @mention even when map matches", () => {
    const decision = route(
      msg({ channel: "slack", external_id: "C0RESEARCH", text: "@legal look at this" }),
      { channelHints: { C0RESEARCH: "research" } }
    );
    expect(decision.agent).toBe("legal");
    expect(decision.rule).toBe("explicit_mention");
  });
});

describe("route — rule 4: sender hint", () => {
  it("routes a known email sender to its preferred agent", () => {
    const decision = route(
      msg({ channel: "email", sender: "accounting@e2s.example" }),
      { senderHints: { "accounting@e2s.example": "ops" } }
    );
    expect(decision.agent).toBe("ops");
    expect(decision.rule).toBe("sender_hint");
    expect(decision.confidence).toBe(0.6);
  });

  it("loses to a channel hint when both match", () => {
    const decision = route(
      msg({
        channel: "slack",
        external_id: "C0RESEARCH",
        sender: "U_OPS_USER",
      }),
      {
        channelHints: { C0RESEARCH: "research" },
        senderHints: { U_OPS_USER: "ops" },
      }
    );
    expect(decision.agent).toBe("research");
    expect(decision.rule).toBe("channel_hint");
  });
});

describe("route — rule 5: fallback to Main", () => {
  it("routes ambiguous messages to main with low confidence", () => {
    const decision = route(msg({ text: "hey can you plan my day" }));
    expect(decision.agent).toBe("main");
    expect(decision.rule).toBe("fallback_main");
    expect(decision.confidence).toBeLessThan(0.5);
  });

  it("routes an empty message to main", () => {
    const decision = route(msg({ text: "" }));
    expect(decision.agent).toBe("main");
    expect(decision.rule).toBe("fallback_main");
  });
});

describe("rule precedence", () => {
  it("explicit mention beats slash command regardless of position", () => {
    // mention first, slash later — mention wins
    const d1 = route(msg({ text: "@research and /ops later" }));
    expect(d1.agent).toBe("research");
    expect(d1.rule).toBe("explicit_mention");
    // slash first, mention later — mention still wins (rule 1 runs before rule 2)
    const d2 = route(msg({ text: "/ops also @research" }));
    expect(d2.agent).toBe("research");
    expect(d2.rule).toBe("explicit_mention");
  });

  it("all five rules can be exercised in a single suite run", () => {
    expect(route(msg({ text: "@research go" })).rule).toBe("explicit_mention");
    expect(route(msg({ text: "/ops go" })).rule).toBe("slash_command");
    expect(
      route(msg({ channel: "slack", external_id: "C1" }), {
        channelHints: { C1: "content" },
      }).rule
    ).toBe("channel_hint");
    expect(
      route(msg({ sender: "x@y" }), { senderHints: { "x@y": "legal" } }).rule
    ).toBe("sender_hint");
    expect(route(msg({ text: "hi" })).rule).toBe("fallback_main");
  });
});
