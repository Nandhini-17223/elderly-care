import {
  escapeHtml,
  formatAppointmentDate,
  formatAppointmentTime,
} from "./email.ts";
import {
  firstName,
  preferenceLabel,
  reasonPlain,
} from "./templates-common.ts";

export const ADMIN_PAGE_BASE =
  "https://nandhini-17223.github.io/elderly-care/admin";

export const RESPOND_BASE =
  "https://nandhini-17223.github.io/elderly-care/respond.html";

export const HELPER_PORTAL_BASE =
  "https://nandhini-17223.github.io/elderly-care/admin/helper.html";

export { firstName, preferenceLabel, reasonPlain };

export const MANAGER_FIRST_NAME = "Manager";

/** Portal deep link: login first, then return to the request. */
export function seniorAssignUrl(requestId: string): string {
  const next = `needs-action.html?request=${encodeURIComponent(requestId)}`;
  return `${ADMIN_PAGE_BASE}/login.html?next=${encodeURIComponent(next)}`;
}

export function needsActionUrl(): string {
  return `${ADMIN_PAGE_BASE}/login.html?next=${
    encodeURIComponent("needs-action.html")
  }`;
}

export function helperProfileUrl(helperId: string): string {
  const next = `helper.html?id=${encodeURIComponent(helperId)}`;
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
  refNumber?: string | null;
}): string {
  const dateLabel = formatAppointmentDate(args.appointmentDate) ??
    args.appointmentDate;
  const timeLabel = formatAppointmentTime(args.appointmentTime) ??
    args.appointmentTime;
  const area = [args.area, args.pincode].filter(Boolean).join(" · ") ||
    "Area on file";

  return `
    <p>
      ${args.refNumber ? `<strong>Ref:</strong> ${escapeHtml(args.refNumber)}<br />` : ""}
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

export function reminderStatusLabel(sentAt: string | null | undefined): string {
  return sentAt ? "sent" : "not sent";
}
