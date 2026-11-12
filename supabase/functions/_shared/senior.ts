import {
  escapeHtml,
  formatAppointmentDate,
  formatAppointmentTime,
} from "./email.ts";

export const ADMIN_PAGE_BASE =
  "https://nandhini-17223.github.io/elderly-care/admin";

export const RESPOND_BASE =
  "https://nandhini-17223.github.io/elderly-care/respond.html";

export function firstName(fullName: string | null | undefined): string {
  const trimmed = String(fullName ?? "").trim();
  if (!trimmed) return "Patient";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function preferenceLabel(value: string | null | undefined): string {
  if (value === "female") return "Female helper";
  if (value === "male") return "Male helper";
  return "No preference";
}

export function reasonPlain(reason: string | null | undefined): string {
  switch (reason) {
    case "short_notice":
      return "Short notice (less than 4 hours before the appointment)";
    case "no_acceptance":
      return "No helper accepted within the offer window";
    case "no_suitable_helpers":
      return "No suitable helpers available";
    case "all_declined":
      return "All helpers declined";
    case "helper_dropped":
      return "Helper dropped out (can’t make it)";
    case "helper_not_confirmed":
      return "Helper did not confirm attendance";
    case "helper_unavailable":
      return "Helper unavailable (deactivated, rejected, or DL expired)";
    default:
      return reason ? reason.replaceAll("_", " ") : "Needs senior attention";
  }
}

/** Portal deep link: login first, then return to the request. */
export function seniorAssignUrl(requestId: string): string {
  const next = `needs-action.html?request=${encodeURIComponent(requestId)}`;
  return `${ADMIN_PAGE_BASE}/login.html?next=${encodeURIComponent(next)}`;
}

export function assignButtonHtml(url: string, label = "Assign helper"): string {
  return `<a href="${url}" style="background:#1d6fd8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;">${escapeHtml(label)}</a>`;
}

export function formatRequestSummaryHtml(args: {
  parentName: string;
  parentAge: number;
  appointmentDate: string;
  appointmentTime: string;
  area?: string | null;
  pincode?: string | null;
  doctorHospital?: string | null;
  helperPreference?: string | null;
  reason?: string | null;
  address?: string | null;
}): string {
  const dateLabel = formatAppointmentDate(args.appointmentDate) ??
    args.appointmentDate;
  const timeLabel = formatAppointmentTime(args.appointmentTime) ??
    args.appointmentTime;
  const area = [args.area, args.pincode].filter(Boolean).join(" · ") ||
    "Area on file";

  return `
    <p>
      <strong>Patient:</strong> ${escapeHtml(args.parentName)} (age ${escapeHtml(String(args.parentAge))})<br />
      <strong>Date:</strong> ${escapeHtml(dateLabel)}<br />
      <strong>Time:</strong> ${escapeHtml(timeLabel)}<br />
      <strong>Area:</strong> ${escapeHtml(area)}<br />
      ${args.doctorHospital ? `<strong>Doctor / Hospital:</strong> ${escapeHtml(args.doctorHospital)}<br />` : ""}
      ${args.helperPreference ? `<strong>Helper preference:</strong> ${escapeHtml(preferenceLabel(args.helperPreference))}<br />` : ""}
      ${args.reason ? `<strong>Reason:</strong> ${escapeHtml(reasonPlain(args.reason))}<br />` : ""}
      ${args.address ? `<strong>Address:</strong> ${escapeHtml(args.address)}<br />` : ""}
    </p>
  `;
}

export function approxDistanceLabel(km: number | null | undefined): string {
  if (km == null || Number.isNaN(Number(km))) return "Nearby";
  const rounded = Math.round(Number(km) * 10) / 10;
  return `~${rounded} km`;
}
