/**
 * NextSMS API v2 (messaging-service.co.tz)
 *
 * Credentials are read from environment variables:
 *   NEXTSMS_API_TOKEN       — API bearer token
 *   NEXTSMS_SENDER_ID       — approved SMS sender name
 *   NEXTSMS_WHATSAPP_ACCOUNT — active WhatsApp account name
 *   NEXTSMS_WHATSAPP_TEMPLATE — active approved WhatsApp template
 *   NEXTSMS_WHATSAPP_MESSAGE_PARAMETER — template placeholder for composed message
 *
 * When credentials are missing the service logs and returns a SIMULATED result
 * so the rest of the application keeps working during development.
 *
 * Reusable for:
 *   - Bulk guest messaging
 *   - OTP / verification codes
 *   - Invitation notifications
 *   - Check-in / scan alerts
 */

import axios, { AxiosError } from "axios";
import { config } from "../config";

const BASE_URL = config.nextsms.baseUrl.replace(/\/$/, "");

// ── Phone normalisation ───────────────────────────────────────────────────────
// Next SMS expects Tanzania international format: 255XXXXXXXXX
// Accepts:  0712345678  →  255712345678
//           712345678   →  255712345678
//           +255712345… →  255712345…
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("255") && digits.length >= 12) return digits;
  if (digits.startsWith("0") && digits.length === 10)  return `255${digits.slice(1)}`;
  if (digits.length === 9 && (digits.startsWith("6") || digits.startsWith("7"))) return `255${digits}`;

  // Cannot determine format — return as-is and let the API reject it
  return digits;
}

function headers() {
  return {
    Authorization: `Bearer ${config.nextsms.apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ── Configuration guard ───────────────────────────────────────────────────────
export function isNextSmsConfigured(): boolean {
  return !!config.nextsms.apiToken;
}

export function isNextSmsWhatsAppConfigured(): boolean {
  return !!(
    config.nextsms.apiToken &&
    config.nextsms.whatsappAccount &&
    config.nextsms.whatsappTemplate
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type SMSStatus = "SENT" | "FAILED" | "SIMULATED";

export interface SMSResult {
  to: string;          // original phone as provided
  dest: string;        // normalised international number sent to
  messageId: string;
  status: SMSStatus;
  error?: string;
}

export interface BulkSMSResult {
  sent: number;
  failed: number;
  results: SMSResult[];
}

// ── sendSMS — single recipient ────────────────────────────────────────────────
/**
 * Send one SMS via Next SMS.
 * Returns an SMSResult describing whether it succeeded or failed.
 */
export async function sendSMS(to: string, text: string, senderId?: string): Promise<SMSResult> {
  const dest = normalizePhone(to);

  // Simulate when credentials are not configured
  if (!isNextSmsConfigured()) {
    console.log("[NextSMS SIMULATED] SMS skipped because the API token is not configured.");
    return { to, dest, messageId: `sim_${Date.now()}`, status: "SIMULATED" };
  }

  const payload = {
    from: senderId || config.nextsms.senderId,
    to:   [dest],
    text,
  };

  try {
    const res = await axios.post(
      `${BASE_URL}/sms/v2/text/single`,
      payload,
      { headers: headers(), timeout: 15_000 }
    );

    // Next SMS returns { messages: [{ to, messageId, status: { name, groupName } }] }
    const msg = res.data?.messages?.[0];
    const groupName = String(msg?.status?.groupName ?? "").toUpperCase();
    const statusName = String(msg?.status?.name ?? "").toUpperCase();
    const messageId = msg?.messageId === undefined || msg?.messageId === null
      ? ""
      : String(msg.messageId);
    const failed =
      !msg ||
      !messageId ||
      groupName === "REJECTED" ||
      statusName.includes("FAILED") ||
      statusName.includes("REJECTED");

    if (failed) {
      const error = statusName || "No valid message result returned by NextSMS";
      console.error(`[NextSMS] SMS rejected for ${dest}: ${error}`);
      return { to, dest, messageId, status: "FAILED", error };
    }

    console.log(`[NextSMS] SMS sent to ${dest}, messageId=${messageId}`);
    return { to, dest, messageId, status: "SENT" };

  } catch (err) {
    const axErr = err as AxiosError;
    const detail = JSON.stringify(axErr.response?.data ?? axErr.message);
    console.error(`[NextSMS] Request error for ${dest}:`, detail);
    return { to, dest, messageId: "", status: "FAILED", error: detail };
  }
}

// ── sendBulkSMS — multiple recipients ────────────────────────────────────────
/**
 * Send SMS to multiple recipients using Next SMS's multi-message endpoint.
 *
 * When `messages` contains per-recipient text (personalised), each message
 * gets its own `text`. When all messages share the same text the API still
 * accepts them in one batch request.
 *
 * Next SMS supports up to 1 000 recipients per request.
 */
export async function sendBulkSMS(
  messages: { to: string; text: string }[],
  reference?: string,
  senderId?: string
): Promise<BulkSMSResult> {
  if (!messages.length) return { sent: 0, failed: 0, results: [] };

  // Simulate when credentials are not configured
  if (!isNextSmsConfigured()) {
    const results: SMSResult[] = messages.map((m, i) => {
      const dest = normalizePhone(m.to);
      console.log("[NextSMS SIMULATED] SMS skipped because the API token is not configured.");
      return { to: m.to, dest, messageId: `sim_${Date.now()}_${i}`, status: "SIMULATED" };
    });
    return { sent: 0, failed: 0, results };
  }

  const payload: Record<string, unknown> = {
    messages: messages.map((m) => ({
      from: senderId || config.nextsms.senderId,
      to:   normalizePhone(m.to),
      text: m.text,
    })),
    ...(reference ? { reference } : {}),
  };

  try {
    const res = await axios.post(
      `${BASE_URL}/sms/v2/text/multi`,
      payload,
      { headers: headers(), timeout: 30_000 }
    );

    // Response: { messages: [{ to, messageId, status: { groupName, name } }] }
    const raw: Array<{
      to: string;
      messageId: number | string;
      status: { groupName: string; name: string };
    }> = res.data?.messages ?? [];

    const results: SMSResult[] = messages.map((m, i) => {
      const dest = normalizePhone(m.to);
      const r = raw[i];
      if (!r || r.messageId === undefined || r.messageId === null) {
        return { to: m.to, dest, messageId: "", status: "FAILED", error: "No valid API response for this recipient" };
      }

      const groupName = String(r.status?.groupName ?? "").toUpperCase();
      const statusName = String(r.status?.name ?? "").toUpperCase();
      const failed =
        (!groupName && !statusName) ||
        groupName === "REJECTED" ||
        statusName.includes("FAIL") ||
        statusName.includes("REJECTED");

      return {
        to: m.to,
        dest,
        messageId: String(r.messageId),
        status: failed ? "FAILED" : "SENT",
        ...(failed ? { error: statusName || "No message status returned" } : {}),
      };
    });

    const sent   = results.filter((r) => r.status === "SENT").length;
    const failed = results.filter((r) => r.status === "FAILED").length;

    console.log(`[NextSMS] Bulk result: ${sent} sent, ${failed} failed`);
    return { sent, failed, results };

  } catch (err) {
    const axErr = err as AxiosError;
    const detail = JSON.stringify(axErr.response?.data ?? axErr.message);
    console.error("[NextSMS] Bulk request error:", detail);

    // Mark everything as failed
    const results: SMSResult[] = messages.map((m) => ({
      to: m.to,
      dest: normalizePhone(m.to),
      messageId: "",
      status: "FAILED",
      error: detail,
    }));
    return { sent: 0, failed: results.length, results };
  }
}

// ── getSMSBalance ─────────────────────────────────────────────────────────────
/**
 * Fetch the remaining SMS credit balance from Next SMS.
 */
export async function getSMSBalance(): Promise<{
  balance: number;
  display: string;
  channel: string;
  smsCount: number;
  whatsappCount: number;
}> {
  if (!isNextSmsConfigured()) {
    return { balance: 0, display: "Credentials not set", channel: "—", smsCount: 0, whatsappCount: 0 };
  }

  try {
    const res = await axios.get(`${BASE_URL}/v2/balance`, {
      headers: headers(),
      timeout: 10_000,
    });

    return {
      balance: res.data?.sms_balance ?? 0,
      display: res.data?.display       ?? String(res.data?.sms_balance ?? 0),
      channel: res.data?.default       ?? "Internet Channel",
      smsCount: Math.max(0, Math.floor((Number(res.data?.sms_balance ?? 0) / 16))),
      whatsappCount: Math.max(0, Math.floor((Number(res.data?.sms_balance ?? 0) / 9))),
    };
  } catch (err) {
    console.error("[NextSMS] Balance check failed:", (err as AxiosError).message);
    return { balance: 0, display: "Error fetching balance", channel: "—", smsCount: 0, whatsappCount: 0 };
  }
}

export async function sendWhatsAppMessage(
  to: string,
  text: string,
  account?: string,
  template?: string,
  messageParameter?: string,
  imageUrl?: string,
  date?: string,
  time?: string
): Promise<string> {
  if (!isNextSmsWhatsAppConfigured()) {
    throw new Error(
      "NextSMS WhatsApp requires an API token, active WhatsApp account, and approved template."
    );
  }

  const destination = normalizePhone(to);
  if (!/^\d+$/.test(destination) || !Number.isSafeInteger(Number(destination))) {
    throw new Error("NextSMS WhatsApp requires a valid international phone number.");
  }

  const payload: Record<string, unknown> = {
    account: account || config.nextsms.whatsappAccount,
    template: template || config.nextsms.whatsappTemplate,
    to: [Number(destination)],
    personalisation: [
      { [messageParameter || config.nextsms.whatsappMessageParameter]: text },
    ],
  };
  if (imageUrl) {
    const publicImageUrl = /^https?:\/\//i.test(imageUrl)
      ? imageUrl
      : imageUrl.startsWith("/")
        ? `${config.origin.replace(/\/$/, "")}${imageUrl}`
        : undefined;
    if (!publicImageUrl) {
      throw new Error("WhatsApp image header must be a public HTTPS URL.");
    }
    payload.header = { image: { file: publicImageUrl, name: "" } };
  }
  if (date && time) {
    payload.date = date;
    payload.time = time;
  }

  const res = await axios.post(
    `${BASE_URL}/whatsapp/v2/text/single`,
    payload,
    { headers: headers(), timeout: 15_000 }
  );

  const msg = res.data?.messages?.[0];
  const groupName = String(msg?.status?.groupName ?? "").toUpperCase();
  const statusName = String(msg?.status?.name ?? "").toUpperCase();
  if (!msg || groupName === "REJECTED" || statusName.includes("FAIL") || statusName.includes("REJECTED")) {
    throw new Error(`NextSMS WhatsApp rejected the message: ${statusName || "No message status returned"}`);
  }

  if (msg.messageId === undefined || msg.messageId === null) {
    throw new Error("NextSMS WhatsApp response did not include a message ID.");
  }

  return String(msg.messageId);
}

export async function testWhatsAppTemplate(
  to: string,
  personalisationValue: string,
  account?: string,
  template?: string,
  messageParameter?: string,
  imageUrl?: string
): Promise<{ messageId: string; message: string }> {
  if (!isNextSmsWhatsAppConfigured()) {
    throw new Error(
      "NextSMS WhatsApp requires an API token, active WhatsApp account, and approved template."
    );
  }

  const destination = normalizePhone(to);
  const publicImageUrl = imageUrl
    ? /^https?:\/\//i.test(imageUrl)
      ? imageUrl
      : imageUrl.startsWith("/")
        ? `${config.origin.replace(/\/$/, "")}${imageUrl}`
        : undefined
    : undefined;
  if (imageUrl && !publicImageUrl) {
    throw new Error("WhatsApp image header must be a public HTTPS URL.");
  }
  const payload: Record<string, unknown> = {
    account: account || config.nextsms.whatsappAccount,
    template: template || config.nextsms.whatsappTemplate,
    to: [Number(destination)],
    personalisation: [
      { [messageParameter || config.nextsms.whatsappMessageParameter]: personalisationValue },
    ],
  };
  if (publicImageUrl) {
    payload.header = { image: { file: publicImageUrl, name: "" } };
  }

  const res = await axios.post(
    `${BASE_URL}/whatsapp/v2/test/text/single`,
    payload,
    { headers: headers(), timeout: 15_000 }
  ).catch((err) => {
    const axErr = err as AxiosError;
    const detail = axErr.response?.data ?? axErr.message;
    throw new Error(`NextSMS WhatsApp test rejected: ${JSON.stringify(detail)}`);
  });

  const msg = res.data?.messages?.[0];
  return {
    messageId: msg?.messageId === undefined || msg?.messageId === null
      ? ""
      : String(msg.messageId),
    message: String(msg?.message || ""),
  };
}
