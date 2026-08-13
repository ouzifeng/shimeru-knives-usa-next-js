const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      // A 400 (e.g. a stray HTML entity in a customer name) would otherwise be
      // lost silently. Surface it so callers can fall back to another channel.
      console.error("Telegram message rejected:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Telegram notification failed:", err);
    return false;
  }
}

// Telegram caps photo captions at 1024 chars (vs 4096 for plain messages).
const TELEGRAM_CAPTION_LIMIT = 1024;

/**
 * Send a photo with the message as its caption. Falls back to a plain text
 * message if there is no photo, if the caption is too long for a caption, or
 * if Telegram rejects the photo (e.g. an unreachable image URL) — so the
 * notification is never lost.
 */
export async function sendTelegramPhoto(photoUrl: string | null, caption: string) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  if (!photoUrl || caption.length > TELEGRAM_CAPTION_LIMIT) {
    await sendTelegramMessage(caption);
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      }),
    });
    // If Telegram could not fetch the image, send the text so nothing is lost.
    if (!res.ok) {
      await sendTelegramMessage(caption);
    }
  } catch (err) {
    console.error("Telegram photo notification failed:", err);
    await sendTelegramMessage(caption);
  }
}
