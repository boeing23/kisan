/**
 * Alert dispatch. A MessageProvider abstracts the SMS/voice channel; the mock
 * provider logs (and records) messages so the whole pipeline runs at $0 without
 * telephony/DLT registration. Swap in Exotel/Gupshup later by implementing the
 * same interface — nothing else changes.
 */
import type { Alert } from "@kisan/core";
import { markDispatched } from "@kisan/db";

export interface OutboundMessage {
  to: string; // E.164 phone
  body: string;
  channel: Alert["channel"];
}

export interface MessageProvider {
  /** Send a message; returns a provider message id. */
  send(msg: OutboundMessage): Promise<string>;
}

/** Mock provider — logs to console + returns a synthetic id. */
export class MockMessageProvider implements MessageProvider {
  public readonly sent: Array<OutboundMessage & { id: string }> = [];

  async send(msg: OutboundMessage): Promise<string> {
    const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sent.push({ ...msg, id });
    console.log(`[MOCK SMS → ${msg.to}] (${msg.channel}) ${msg.body}`);
    return id;
  }
}

/**
 * Dispatch an alert via the provider and record the result in Firestore.
 * Idempotency (don't re-send) is the caller's responsibility — see the
 * scheduler's alertExistsToday guard.
 */
export async function dispatchAlert(
  alert: Alert,
  toPhone: string,
  provider: MessageProvider
): Promise<void> {
  const ref = await provider.send({
    to: toPhone,
    body: alert.message,
    channel: alert.channel,
  });
  await markDispatched(alert.id, ref);
}
