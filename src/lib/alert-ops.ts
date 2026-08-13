import { sendTelegramMessage } from "@/lib/telegram";
import { sendTransactionalEmail } from "@/lib/postmark";

const OPS_EMAIL = "mr.davidoak@gmail.com";

// Best-effort operational alert for background failures (cron/sync) that would
// otherwise only land in a DB column nobody watches. Tries Telegram first, then
// falls back to email. Never throws, so a failing alert can't break its caller.
export async function alertOps(context: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  const text =
    `🚨 <b>Ops alert (US)</b>\n\n` +
    `<b>Where:</b> ${context}\n` +
    `<b>Error:</b> ${detail}`;
  try {
    if (await sendTelegramMessage(text)) return;
  } catch {
    // fall through to email
  }
  try {
    const safe = detail.replace(/[<>&]/g, (c) =>
      c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
    );
    await sendTransactionalEmail({
      to: OPS_EMAIL,
      subject: `[Shimeru US] Ops alert: ${context}`,
      html: `<p>A background job failed:</p><p><strong>${context}</strong></p><pre>${safe}</pre>`,
      tag: "ops-alert",
    });
  } catch (e) {
    console.error("alertOps: both channels failed:", e);
  }
}
