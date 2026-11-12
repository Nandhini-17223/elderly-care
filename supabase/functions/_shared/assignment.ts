import {
  formatAppointmentDate,
  formatAppointmentTime,
} from "./email.ts";
import { RESPOND_BASE, firstName } from "./senior.ts";
import {
  templateG3,
  templateG4,
  templateG5,
  templateH2,
  templateH3,
  templateH4,
  type EmailContent,
} from "./templates.ts";

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
  ref_number?: string | null;
};

export function fullPickupAddress(request: RequestContact): string {
  return [
    request.address_line1,
    request.street,
    request.area,
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

export type GuardianHelperInfo = {
  full_name: string;
  phone: string;
  photo_url?: string | null;
};

export function appointmentConfirmedEmail(
  request: RequestContact,
  helperName: string,
  token: string,
): EmailContent {
  const address = fullPickupAddress(request);
  return templateH2({
    ref: String(request.ref_number ?? "–"),
    helper_first_name: firstName(helperName),
    parent_name: request.parent_name,
    parent_age: request.parent_age,
    address_line1: request.address_line1,
    street: request.street,
    area: request.area,
    city: request.city,
    pincode: request.pincode,
    landmark: request.landmark,
    maps_url: mapsSearchUrl(address),
    appointment_date: request.appointment_date,
    appointment_time: request.appointment_time,
    doctor_hospital: request.doctor_hospital,
    booking_person_name: request.booking_person_name,
    relationship: request.relationship,
    guardian_phone: familyPhone(request),
    cant_make_it_url: actionUrl(token, "cant_make_it"),
  });
}

/** @deprecated use appointmentConfirmedEmail */
export function appointmentConfirmedEmailHtml(
  request: RequestContact,
  helperName: string,
  token: string,
): string {
  return appointmentConfirmedEmail(request, helperName, token).html;
}

export function reminderEmail(
  request: RequestContact,
  helperName: string,
  token: string,
  kind: "12h" | "6h",
): EmailContent {
  const address = fullPickupAddress(request);
  const base = {
    ref: String(request.ref_number ?? "–"),
    helper_first_name: firstName(helperName),
    parent_name: request.parent_name,
    area: request.area,
    appointment_date: request.appointment_date,
    appointment_time: request.appointment_time,
    full_address: address,
    maps_url: mapsSearchUrl(address),
    doctor_hospital: request.doctor_hospital,
    booking_person_name: request.booking_person_name,
    relationship: request.relationship,
    guardian_phone: familyPhone(request),
    cant_make_it_url: actionUrl(token, "cant_make_it"),
  };
  if (kind === "6h") {
    return templateH4({
      ...base,
      confirm_url: actionUrl(token, "confirm_attendance"),
    });
  }
  return templateH3(base);
}

/** @deprecated use reminderEmail */
export function reminderEmailHtml(
  request: RequestContact,
  helperName: string,
  token: string,
  kind: "12h" | "6h",
): string {
  return reminderEmail(request, helperName, token, kind).html;
}

export function guardianNewHelperEmail(
  request: RequestContact,
  helper: GuardianHelperInfo,
  oldHelperFirstName: string,
): EmailContent {
  return templateG5({
    ref: String(request.ref_number ?? "–"),
    booking_person_name: request.booking_person_name,
    parent_name: request.parent_name,
    helper_full_name: helper.full_name,
    helper_phone: helper.phone,
    helper_photo_url: helper.photo_url,
    old_helper_first_name: oldHelperFirstName || "the previous helper",
    appointment_date: request.appointment_date,
    appointment_time: request.appointment_time,
    doctor_hospital: request.doctor_hospital,
  });
}

/** @deprecated use guardianNewHelperEmail */
export function guardianNewHelperEmailHtml(
  request: RequestContact,
  helper: GuardianHelperInfo,
  oldHelperFirstName = "the previous helper",
): string {
  return guardianNewHelperEmail(request, helper, oldHelperFirstName).html;
}

export function guardianHelperAssignedEmail(
  request: RequestContact,
  helper: GuardianHelperInfo,
): EmailContent {
  return templateG3({
    ref: String(request.ref_number ?? "–"),
    booking_person_name: request.booking_person_name,
    parent_name: request.parent_name,
    helper_full_name: helper.full_name,
    helper_phone: helper.phone,
    helper_photo_url: helper.photo_url,
    appointment_date: request.appointment_date,
    appointment_time: request.appointment_time,
    doctor_hospital: request.doctor_hospital,
    address_line1: request.address_line1,
    street: request.street,
    area: request.area,
    city: request.city,
    pincode: request.pincode,
  });
}

/** @deprecated use guardianHelperAssignedEmail */
export function guardianHelperAssignedEmailHtml(
  request: RequestContact,
  helper: GuardianHelperInfo,
): string {
  return guardianHelperAssignedEmail(request, helper).html;
}

export function guardianReplacementArrangingEmail(
  request: RequestContact,
  helperFullName: string,
): EmailContent {
  return templateG4({
    ref: String(request.ref_number ?? "–"),
    booking_person_name: request.booking_person_name,
    parent_name: request.parent_name,
    old_helper_first_name: firstName(helperFullName),
    appointment_date: request.appointment_date,
    appointment_time: request.appointment_time,
  });
}

/** @deprecated use guardianReplacementArrangingEmail */
export function guardianReplacementArrangingHtml(
  request: RequestContact,
  helperFullName: string,
): string {
  return guardianReplacementArrangingEmail(request, helperFullName).html;
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
