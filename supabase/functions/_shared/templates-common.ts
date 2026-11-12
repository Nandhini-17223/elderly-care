/**
 * Shared helpers for ABI Parent Care email templates.
 */
import {
  displayValue,
  escapeHtml,
  formatAppointmentTime,
  wrapEmailHtml,
  wrapEmailText,
} from "./email.ts";

export type EmailContent = {
  id: string;
  subject: string;
  html: string;
  text: string;
};

export function firstName(fullName: string | null | undefined): string {
  const trimmed = String(fullName ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function preferenceLabel(value: string | null | undefined): string {
  if (value === "female") return "Female helper";
  if (value === "male") return "Male helper";
  if (value === "no_preference" || value === "none" || !value) {
    return "No preference";
  }
  return displayValue(value, "No preference");
}

/** Plain-language reasons for M2 (and portal). */
export function reasonPlain(reason: string | null | undefined): string {
  switch (reason) {
    case "no_acceptance":
      return "No helper accepted within 2 hours";
    case "no_suitable_helpers":
      return "No suitable helper nearby";
    case "all_declined":
      return "All offered helpers declined";
    case "short_notice":
      return "Booked at short notice";
    case "helper_dropped":
      return "Helper dropped out";
    case "helper_not_confirmed":
      return "Helper didn't confirm";
    case "helper_unavailable":
      return "Helper no longer available";
    default:
      return reason ? reason.replaceAll("_", " ") : "Needs senior attention";
  }
}

export function timeLabel(appointmentTime?: string | null): string {
  return formatAppointmentTime(appointmentTime) ?? displayValue(appointmentTime);
}

export function sectionHeading(label: string): string {
  return `<p style="margin:22px 0 8px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;font-weight:700;">${escapeHtml(label)}</p>`;
}

export function line(label: string, value: string): string {
  return `<div style="margin:0 0 6px;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`;
}

export function textLine(label: string, value: string): string {
  return `${label}: ${value}`;
}

export function helperPhotoBlock(photoUrl?: string | null): string {
  if (!photoUrl) return "";
  return `<p style="margin:16px 0;"><img src="${escapeHtml(photoUrl)}" alt="Helper photo" width="160" height="160" style="border-radius:12px;object-fit:cover;display:block;border:1px solid #e5e7eb;" /></p>`;
}

export function joinAddress(parts: Array<string | null | undefined>): string {
  return parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(", ");
}

export function build(
  id: string,
  subject: string,
  ref: string | null | undefined,
  bodyHtml: string,
  bodyText: string,
): EmailContent {
  return {
    id,
    subject,
    html: wrapEmailHtml({ bodyHtml, ref, preheader: subject }),
    text: wrapEmailText({ bodyText, ref }),
  };
}

// ---------------------------------------------------------------------------

/** On-screen messages for respond.html / action pages. */
export const ON_SCREEN = {
  accept_confirm: {
    title: "Accept this visit?",
    message:
      "{{appointment_date_short}} · {{appointment_time}} · {{area}}. Tap Confirm to take this visit.",
    button: "Confirm",
  },
  accepted: {
    title: "This visit is yours!",
    message:
      "We've emailed you the full details. Thank you, {{helper_first_name}}.",
  },
  already_taken: {
    title: "Already taken",
    message:
      "Another helper accepted this visit first. Thank you for responding quickly.",
  },
  helper_engaged: {
    title: "You're already booked",
    message:
      "You have another visit around this time, so we can't assign this one to you.",
  },
  declined: {
    title: "Thanks for letting us know",
    message: "We've offered this visit to another helper.",
  },
  confirmed: {
    title: "See you there!",
    message: "Thanks for confirming. The family is counting on you.",
  },
  cant_make_it_confirm: {
    title: "Can't make this visit?",
    message:
      "Tell us why (optional), then tap Confirm. We'll arrange a replacement.",
    button: "Confirm",
  },
  cant_make_it_done: {
    title: "Thanks for telling us",
    message: "Our care team will arrange a replacement.",
  },
  link_inactive: {
    title: "This link is no longer active",
    message:
      "The visit may have been assigned, cancelled or already passed. Please contact your manager if you need help.",
  },
} as const;

export function fillOnScreen(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    displayValue(vars[key], "")
  );
}
