import { defineTool } from "./registry";

const API_BASE = "https://api.stripe.com/v1";

function authHeader(): string {
  const key = process.env.STRIPE_API_KEY;
  if (!key) throw new Error("STRIPE_API_KEY not set");
  if (!key.startsWith("rk_")) {
    // Defense in depth: only allow restricted keys, never sk_live or sk_test.
    // Restricted keys can't accidentally be granted write scope without
    // being explicitly created that way in the Stripe dashboard.
    throw new Error(
      "STRIPE_API_KEY must be a restricted key (rk_*). Refusing to use a non-restricted key from agents."
    );
  }
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

async function stripeGet<T = unknown>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(API_BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`stripe ${path}: ${res.status} ${err.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ─── stripe.balance ─────────────────────────────────────────────────────────

export const balance = defineTool<Record<string, never>, unknown>({
  name: "stripe.balance",
  description: "Current Stripe account balance. Returns available, pending, and connect_reserved totals per currency.",
  source: "builtin",
  initial_status: "standard",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  async handler() {
    return stripeGet("/balance");
  },
});

// ─── stripe.list_charges ────────────────────────────────────────────────────

export interface ListChargesInput {
  limit?: number;
  customer?: string;
  created_gte?: number;
  created_lte?: number;
}

export const listCharges = defineTool<ListChargesInput, unknown>({
  name: "stripe.list_charges",
  description:
    "List recent charges. Optional filters: limit (1-100, default 10), customer (cus_*), created_gte / created_lte (Unix timestamps).",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100 },
      customer: { type: "string", description: "Stripe customer id (cus_*)." },
      created_gte: { type: "integer", description: "Unix timestamp lower bound." },
      created_lte: { type: "integer", description: "Unix timestamp upper bound." },
    },
    additionalProperties: false,
  },
  async handler(input) {
    const q: Record<string, string | number | undefined> = {
      limit: input.limit ?? 10,
      customer: input.customer,
    };
    if (input.created_gte) q["created[gte]"] = input.created_gte;
    if (input.created_lte) q["created[lte]"] = input.created_lte;
    return stripeGet("/charges", q);
  },
});

// ─── stripe.list_customers ──────────────────────────────────────────────────

export interface ListCustomersInput {
  limit?: number;
  email?: string;
}

export const listCustomers = defineTool<ListCustomersInput, unknown>({
  name: "stripe.list_customers",
  description: "List or search Stripe customers. Optional: limit (1-100), email (exact match).",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100 },
      email: { type: "string" },
    },
    additionalProperties: false,
  },
  async handler({ limit, email }) {
    return stripeGet("/customers", { limit: limit ?? 10, email });
  },
});

// ─── stripe.list_invoices ───────────────────────────────────────────────────

export interface ListInvoicesInput {
  limit?: number;
  customer?: string;
  status?: "draft" | "open" | "paid" | "uncollectible" | "void";
}

export const listInvoices = defineTool<ListInvoicesInput, unknown>({
  name: "stripe.list_invoices",
  description: "List invoices. Optional: limit, customer, status (draft|open|paid|uncollectible|void).",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100 },
      customer: { type: "string" },
      status: {
        type: "string",
        enum: ["draft", "open", "paid", "uncollectible", "void"],
      },
    },
    additionalProperties: false,
  },
  async handler({ limit, customer, status }) {
    return stripeGet("/invoices", { limit: limit ?? 10, customer, status });
  },
});

// ─── stripe.list_payouts ────────────────────────────────────────────────────

export interface ListPayoutsInput {
  limit?: number;
  status?: "paid" | "pending" | "in_transit" | "canceled" | "failed";
}

export const listPayouts = defineTool<ListPayoutsInput, unknown>({
  name: "stripe.list_payouts",
  description: "List payouts to your bank. Optional: limit, status.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100 },
      status: {
        type: "string",
        enum: ["paid", "pending", "in_transit", "canceled", "failed"],
      },
    },
    additionalProperties: false,
  },
  async handler({ limit, status }) {
    return stripeGet("/payouts", { limit: limit ?? 10, status });
  },
});

export default balance;
