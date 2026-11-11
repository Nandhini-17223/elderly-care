export type SendEmailArgs = {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
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

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatAppointmentDate(
  appointmentDate?: string | null,
): string | null {
  if (!appointmentDate) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(appointmentDate.trim());
  if (!dateMatch) return null;
  const months = [
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
  const day = Number(dateMatch[3]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[1]);
  if (!month || month < 1 || month > 12) return null;
  return `${day} ${months[month - 1]} ${year}`;
}

export function formatAppointmentTime(
  appointmentTime?: string | null,
): string | null {
  if (!appointmentTime) return null;
  const timeMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(appointmentTime.trim());
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
  const hour12 = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;
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

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "ABI Parent Care <onboarding@resend.dev>",
      to: [finalTo],
      subject: finalSubject,
      html: args.html,
    }),
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
