import {
  escapeHtml,
  formatAppointmentDate,
  formatAppointmentTime,
} from "./email.ts";
import { RESPOND_BASE, firstName } from "./senior.ts";

export type RequestContact = {
  parent_name: string;
  parent_age: number;
  address_line1: string | null;
  street: string | null;
  area: string | null;
  landmark: string | null;
  city: string;
  pincode: string | null;
  appointment_date: string;
  appointment_time: string;
  doctor_hospital: string;
  booking_person_name: string;
  relationship: string;
  phone_country_code: string;
  phone: string;
  email?: string;
};

export function fullPickupAddress(request: RequestContact): string {
  return [
    request.address_line1,
    request.street,
    request.area,
    request.landmark ? `Landmark: ${request.landmark}` : null,
    request.city,
    request.pincode,
  ]
    .map((part) => (part ? String(part).trim() : ""))
    .filter(Boolean)
    .join(", ");
}

export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${
    encodeURIComponent(address)
  }`;
}

export function familyPhone(request: RequestContact): string {
  return `${request.phone_country_code} ${request.phone}`.trim();
}

export function appointmentLabels(request: {
  appointment_date: string;
  appointment_time: string;
}): { dateLabel: string; timeLabel: string } {
  return {
    dateLabel: formatAppointmentDate(request.appointment_date) ??
      request.appointment_date,
    timeLabel: formatAppointmentTime(request.appointment_time) ??
      request.appointment_time,
  };
}

export function actionUrl(token: string, action: string): string {
  return `${RESPOND_BASE}?token=${encodeURIComponent(token)}&action=${
    encodeURIComponent(action)
  }`;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export async function createRawToken(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToHex(bytes);
  const hash = await sha256Hex(token);
  return { token, hash };
}

export function patientDetailsHtml(
  request: RequestContact,
  options?: { includeMaps?: boolean },
): string {
  const { dateLabel, timeLabel } = appointmentLabels(request);
  const address = fullPickupAddress(request);
  const maps = mapsSearchUrl(address);
  const phone = familyPhone(request);
  const includeMaps = options?.includeMaps !== false;

  return `
    <p>
      <strong>Patient:</strong> ${escapeHtml(request.parent_name)} (age ${escapeHtml(String(request.parent_age))})<br />
      <strong>Date:</strong> ${escapeHtml(dateLabel)}<br />
      <strong>Time:</strong> ${escapeHtml(timeLabel)}<br />
      <strong>Pickup address:</strong> ${escapeHtml(address)}<br />
      ${
    includeMaps
      ? `<strong>Maps:</strong> <a href="${maps}">${escapeHtml(maps)}</a><br />`
      : ""
  }
      <strong>Doctor / Hospital:</strong> ${escapeHtml(request.doctor_hospital)}<br />
      <strong>Family contact:</strong> ${escapeHtml(request.booking_person_name)}
      (${escapeHtml(request.relationship)}) — ${escapeHtml(phone)}
    </p>
  `;
}

export function cantMakeItButtonHtml(token: string): string {
  const url = actionUrl(token, "cant_make_it");
  return `<a href="${url}" style="background:#e5e7eb;color:#111827;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;">❌ Can’t make it</a>`;
}

export function confirmAttendanceButtonHtml(token: string): string {
  const url = actionUrl(token, "confirm_attendance");
  return `<a href="${url}" style="background:#15803d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;margin-right:8px;">✅ I’ll be there</a>`;
}

export function appointmentConfirmedEmailHtml(
  request: RequestContact,
  helperName: string,
  token: string,
): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${escapeHtml(helperName)},</p>
      <p>Your appointment is confirmed.</p>
      ${patientDetailsHtml(request)}
      <p style="margin: 24px 0;">
        ${cantMakeItButtonHtml(token)}
      </p>
      <p>Warm regards,<br />ABI Parent Care</p>
    </div>
  `;
}

export function reminderEmailHtml(
  request: RequestContact,
  helperName: string,
  token: string,
  kind: "12h" | "6h",
): string {
  const buttons = kind === "6h"
    ? `${confirmAttendanceButtonHtml(token)}${cantMakeItButtonHtml(token)}`
    : cantMakeItButtonHtml(token);
  const lead = kind === "6h"
    ? "This is your 6-hour reminder for the upcoming appointment."
    : "This is your 12-hour reminder for the upcoming appointment.";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${escapeHtml(helperName)},</p>
      <p>${lead}</p>
      ${patientDetailsHtml(request)}
      <p style="margin: 24px 0;">${buttons}</p>
      <p>Warm regards,<br />ABI Parent Care</p>
    </div>
  `;
}

export type GuardianHelperInfo = {
  full_name: string;
  phone: string;
  photo_url?: string | null;
};

function helperPhotoHtml(helper: GuardianHelperInfo): string {
  if (!helper.photo_url) return "";
  return `<p><img src="${escapeHtml(helper.photo_url)}" alt="Helper photo" width="160" height="160" style="border-radius:12px;object-fit:cover;display:block;" /></p>`;
}

export function guardianNewHelperEmailHtml(
  request: RequestContact,
  helper: GuardianHelperInfo,
): string {
  const { dateLabel, timeLabel } = appointmentLabels(request);
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${escapeHtml(request.booking_person_name)},</p>
      <p>Your new helper is <strong>${escapeHtml(helper.full_name)}</strong>, phone ${escapeHtml(helper.phone)}.</p>
      ${helperPhotoHtml(helper)}
      <p>
        <strong>Patient:</strong> ${escapeHtml(request.parent_name)}<br />
        <strong>Date:</strong> ${escapeHtml(dateLabel)}<br />
        <strong>Time:</strong> ${escapeHtml(timeLabel)}<br />
        <strong>Hospital:</strong> ${escapeHtml(request.doctor_hospital)}
      </p>
      <p>Warm regards,<br />ABI Parent Care</p>
    </div>
  `;
}

export function guardianHelperAssignedEmailHtml(
  request: RequestContact,
  helper: GuardianHelperInfo,
): string {
  const { dateLabel, timeLabel } = appointmentLabels(request);
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${escapeHtml(request.booking_person_name)},</p>
      <p>A helper has been assigned for your appointment.</p>
      ${helperPhotoHtml(helper)}
      <p>
        <strong>Helper:</strong> ${escapeHtml(helper.full_name)}<br />
        <strong>Helper phone:</strong> ${escapeHtml(helper.phone)}<br />
        <strong>Date:</strong> ${escapeHtml(dateLabel)}<br />
        <strong>Time:</strong> ${escapeHtml(timeLabel)}<br />
        <strong>Hospital:</strong> ${escapeHtml(request.doctor_hospital)}
      </p>
      <p>Warm regards,<br />ABI Parent Care</p>
    </div>
  `;
}

export function guardianReplacementArrangingHtml(
  request: RequestContact,
  helperFullName: string,
): string {
  const { dateLabel, timeLabel } = appointmentLabels(request);
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${escapeHtml(request.booking_person_name)},</p>
      <p>${escapeHtml(firstName(helperFullName))} is unable to attend ${escapeHtml(request.parent_name)}’s appointment on ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}. We’re arranging a replacement urgently and will share the new helper’s details shortly.</p>
      <p>Warm regards,<br />ABI Parent Care</p>
    </div>
  `;
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "less than 1 minute";
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${minutes}m`;
}
