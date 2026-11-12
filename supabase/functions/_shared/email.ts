export type SendEmailArgs = {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult = {
  ok: boolean;
  status: number;
  id?: string;
  to: string;
  subject: string;
  testMode: boolean;
  error?: unknown;
};

export const SUPPORT_PHONE = "+91 73399 11220";
export const HELPER_APP_LINK =
  "https://nandhini-17223.github.io/elderly-care/helper/";
export const LOGO_URL =
  "https://nandhini-17223.github.io/elderly-care/assets/img/logo.svg";
export const BRAND_PRIMARY = "#1d6fd8";
export const BRAND_ACCENT = "#4a9cf7";
export const BRAND_TEXT = "#1f2937";
export const BRAND_MUTED = "#6b7280";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Show a dash (or custom fallback) instead of blank/null/undefined. */
export function displayValue(
  value: string | number | null | undefined,
  fallback = "–",
): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") {
    return fallback;
  }
  return text;
}

export function displayOrNone(
  value: string | number | null | undefined,
): string {
  return displayValue(value, "None given");
}

function parseDateParts(appointmentDate?: string | null): {
  year: number;
  month: number;
  day: number;
} | null {
  if (!appointmentDate) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(appointmentDate.trim());
  if (!dateMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (!month || month < 1 || month > 12 || !day || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day };
}

function parseTimeParts(appointmentTime?: string | null): {
  hour24: number;
  minute: number;
} | null {
  if (!appointmentTime) return null;
  const timeMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(
    appointmentTime.trim(),
  );
  if (!timeMatch) return null;
  const hour24 = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (
    !Number.isInteger(hour24) ||
    !Number.isInteger(minute) ||
    hour24 < 0 ||
    hour24 > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour24, minute };
}

/** Appointment instant as UTC ms interpreting wall time in Asia/Kolkata. */
export function appointmentMsIst(
  appointmentDate?: string | null,
  appointmentTime?: string | null,
): number {
  const d = parseDateParts(appointmentDate);
  const t = parseTimeParts(appointmentTime) ?? { hour24: 0, minute: 0 };
  if (!d) return NaN;
  return Date.parse(
    `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${
      String(d.day).padStart(2, "0")
    }T${String(t.hour24).padStart(2, "0")}:${
      String(t.minute).padStart(2, "0")
    }:00+05:30`,
  );
}

/** "13 Nov 2026" — kept for older callers; prefer formatAppointmentDateShort. */
export function formatAppointmentDate(
  appointmentDate?: string | null,
): string | null {
  const d = parseDateParts(appointmentDate);
  if (!d) return null;
  return `${d.day} ${MONTHS_SHORT[d.month - 1]} ${d.year}`;
}

/** {{appointment_date_short}} → "13 Nov" */
export function formatAppointmentDateShort(
  appointmentDate?: string | null,
): string {
  const d = parseDateParts(appointmentDate);
  if (!d) return displayValue(appointmentDate);
  return `${d.day} ${MONTHS_SHORT[d.month - 1]}`;
}

/** {{appointment_date_long}} → "Thu, 13 Nov 2026" */
export function formatAppointmentDateLong(
  appointmentDate?: string | null,
): string {
  const d = parseDateParts(appointmentDate);
  if (!d) return displayValue(appointmentDate);
  const weekday = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return `${WEEKDAYS_SHORT[weekday]}, ${d.day} ${MONTHS_SHORT[d.month - 1]} ${d.year}`;
}

/** {{appointment_time}} → "10:00 AM" */
export function formatAppointmentTime(
  appointmentTime?: string | null,
): string | null {
  const t = parseTimeParts(appointmentTime);
  if (!t) return null;
  const hour12 = t.hour24 % 12 || 12;
  const ampm = t.hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(t.minute).padStart(2, "0")} ${ampm}`;
}

export function formatAppointmentDateTime(
  appointmentDate?: string | null,
  appointmentTime?: string | null,
): string | null {
  const datePart = formatAppointmentDate(appointmentDate);
  const timePart = formatAppointmentTime(appointmentTime);
  if (!datePart || !timePart) return null;
  return `${datePart}, ${timePart}`;
}

function istYmd(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/**
 * {{relative_time}} examples:
 * "today · in 1 hour", "tomorrow", "in 3 days"
 */
export function formatRelativeTime(
  appointmentDate?: string | null,
  appointmentTime?: string | null,
  nowMs: number = Date.now(),
): string {
  const appt = appointmentMsIst(appointmentDate, appointmentTime);
  if (!Number.isFinite(appt)) return "–";

  const today = istYmd(nowMs);
  const apptDay = istYmd(appt);
  const todayParts = parseDateParts(today)!;
  const apptParts = parseDateParts(apptDay)!;
  const dayDiff = Math.round(
    (Date.UTC(apptParts.year, apptParts.month - 1, apptParts.day) -
      Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day)) /
      86400000,
  );

  if (dayDiff === 0) {
    const deltaMs = appt - nowMs;
    if (deltaMs <= 0) return "today";
    const totalMinutes = Math.round(deltaMs / 60000);
    if (totalMinutes < 60) {
      return `today · in ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
    }
    const hours = Math.round(totalMinutes / 60);
    return `today · in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (dayDiff === 1) return "tomorrow";
  if (dayDiff > 1) return `in ${dayDiff} days`;
  if (dayDiff === -1) return "yesterday";
  return `${Math.abs(dayDiff)} days ago`;
}

export function formatIstDateTime(iso?: string | null): string {
  if (!iso) return "–";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return displayValue(iso);
  const d = new Date(ms);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const weekday = get("weekday");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod").toUpperCase();
  return `${weekday}, ${day} ${month} ${year} · ${hour}:${minute} ${dayPeriod}`;
}

export function emailButtonHtml(
  href: string,
  label: string,
  variant: "primary" | "secondary" = "primary",
): string {
  const bg = variant === "primary" ? BRAND_PRIMARY : "#e5e7eb";
  const color = variant === "primary" ? "#ffffff" : "#111827";
  return `<a href="${escapeHtml(href)}" style="background:${bg};color:${color};padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;margin:0 8px 8px 0;">${escapeHtml(label)}</a>`;
}

export function emailFooterText(): string {
  return `This is an automated message from ABI Parent Care. For help, call ${SUPPORT_PHONE}.`;
}

export function wrapEmailHtml(args: {
  bodyHtml: string;
  ref?: string | null;
  preheader?: string;
}): string {
  const ref = displayValue(args.ref, "");
  const refHtml = ref
    ? `<td align="right" style="font-size:13px;color:${BRAND_MUTED};white-space:nowrap;">Ref <strong style="color:${BRAND_TEXT};">${escapeHtml(ref)}</strong></td>`
    : `<td></td>`;
  const preheader = args.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(args.preheader)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f3f6fb;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="background:linear-gradient(135deg,${BRAND_PRIMARY},${BRAND_ACCENT});padding:18px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle;">
                <img src="${LOGO_URL}" alt="ABI Parent Care" width="36" height="36" style="display:inline-block;vertical-align:middle;border:0;" />
                <span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.02em;">ABI Parent Care</span>
              </td>
              ${
    ref
      ? `<td align="right" style="vertical-align:middle;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:13px;">Ref <strong>${escapeHtml(ref)}</strong></td>`
      : ""
  }
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${BRAND_TEXT};">
          ${args.bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 22px 22px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${BRAND_MUTED};">
          ${escapeHtml(emailFooterText())}
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function wrapEmailText(args: {
  bodyText: string;
  ref?: string | null;
}): string {
  const lines = [
    "ABI Parent Care",
    args.ref ? `Ref ${displayValue(args.ref)}` : null,
    "",
    args.bodyText.trim(),
    "",
    emailFooterText(),
  ].filter((line) => line !== null);
  return lines.join("\n");
}

/**
 * Shared Resend sender used by all edge functions.
 * If EMAIL_TEST_MODE === 'true', every email goes to TEST_EMAIL_TO with
 * subject prefixed "[To: <real recipient name/email>]".
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    throw new Error("Missing RESEND_API_KEY secret");
  }

  const testMode = Deno.env.get("EMAIL_TEST_MODE") === "true";
  const testTo = Deno.env.get("TEST_EMAIL_TO")?.trim() || "";
  const realRecipientLabel = (args.toName?.trim() || args.to).trim();

  const finalTo = testMode && testTo ? testTo : args.to;
  const finalSubject =
    testMode && testTo
      ? `[To: ${realRecipientLabel}] ${args.subject}`
      : args.subject;

  const payload: Record<string, unknown> = {
    from: "ABI Parent Care <onboarding@resend.dev>",
    to: [finalTo],
    subject: finalSubject,
    html: args.html,
  };
  if (args.text && args.text.trim()) {
    payload.text = args.text;
  }

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const emailResult = await emailResponse.json();
  if (!emailResponse.ok) {
    console.error("Resend error:", emailResult);
    return {
      ok: false,
      status: emailResponse.status,
      to: finalTo,
      subject: finalSubject,
      testMode,
      error: emailResult,
    };
  }

  return {
    ok: true,
    status: emailResponse.status,
    id: typeof emailResult?.id === "string" ? emailResult.id : undefined,
    to: finalTo,
    subject: finalSubject,
    testMode,
  };
}
