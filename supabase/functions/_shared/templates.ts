/**
 * Approved ABI Parent Care email templates (G1–G5, H1–H5, M1–M9).
 * Wording matches email-templates.md — edit here to change copy.
 */
import {
  SUPPORT_PHONE,
  HELPER_APP_LINK,
  displayOrNone,
  displayValue,
  emailButtonHtml,
  escapeHtml,
  formatAppointmentDateLong,
  formatAppointmentDateShort,
  formatAppointmentTime,
  formatIstDateTime,
  formatRelativeTime,
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

function timeLabel(appointmentTime?: string | null): string {
  return formatAppointmentTime(appointmentTime) ?? displayValue(appointmentTime);
}

function sectionHeading(label: string): string {
  return `<p style="margin:22px 0 8px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;font-weight:700;">${escapeHtml(label)}</p>`;
}

function line(label: string, value: string): string {
  return `<div style="margin:0 0 6px;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`;
}

function textLine(label: string, value: string): string {
  return `${label}: ${value}`;
}

function helperPhotoBlock(photoUrl?: string | null): string {
  if (!photoUrl) return "";
  return `<p style="margin:16px 0;"><img src="${escapeHtml(photoUrl)}" alt="Helper photo" width="160" height="160" style="border-radius:12px;object-fit:cover;display:block;border:1px solid #e5e7eb;" /></p>`;
}

function joinAddress(parts: Array<string | null | undefined>): string {
  return parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(", ");
}

function build(
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
// Guardian emails
// ---------------------------------------------------------------------------

export type G1Vars = {
  ref: string;
  booking_person_name: string;
  parent_name: string;
  appointment_date: string;
  appointment_time: string;
  doctor_hospital: string;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
  helper_preference?: string | null;
};

export function templateG1(v: G1Vars): EmailContent {
  const dateShort = formatAppointmentDateShort(v.appointment_date);
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const pickup = joinAddress([v.area, v.city, v.pincode]) || "–";
  const pref = preferenceLabel(v.helper_preference);
  const subject =
    `We've received your request – ${v.parent_name}, ${dateShort} · Ref ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Dear ${escapeHtml(v.booking_person_name)},</p>
    <p style="margin:0 0 12px;">Thank you for choosing ABI Parent Care. We've received your request for ${escapeHtml(v.parent_name)}'s doctor appointment.</p>
    ${sectionHeading("Appointment")}
    ${line("Date & time", `${dateLong} · ${time}`)}
    ${line("Doctor/Hospital", displayValue(v.doctor_hospital))}
    ${line("Pickup from", pickup)}
    ${line("Helper preference", pref)}
    ${sectionHeading("What happens next")}
    <p style="margin:0 0 12px;">We're matching a verified helper near you. As soon as a helper is confirmed, we'll email you their name, photo and phone number.</p>
    <p style="margin:0 0 12px;">Need to change anything? Call us on ${escapeHtml(SUPPORT_PHONE)} and quote Ref ${escapeHtml(v.ref)}.</p>
    <p style="margin:18px 0 0;">Warm regards,<br />The ABI Parent Care team</p>
  `;

  const bodyText = [
    `Dear ${v.booking_person_name},`,
    "",
    `Thank you for choosing ABI Parent Care. We've received your request for ${v.parent_name}'s doctor appointment.`,
    "",
    "APPOINTMENT",
    textLine("Date & time", `${dateLong} · ${time}`),
    textLine("Doctor/Hospital", displayValue(v.doctor_hospital)),
    textLine("Pickup from", pickup),
    textLine("Helper preference", pref),
    "",
    "WHAT HAPPENS NEXT",
    "We're matching a verified helper near you. As soon as a helper is confirmed, we'll email you their name, photo and phone number.",
    "",
    `Need to change anything? Call us on ${SUPPORT_PHONE} and quote Ref ${v.ref}.`,
    "",
    "Warm regards,",
    "The ABI Parent Care team",
  ].join("\n");

  return build("G1", subject, v.ref, bodyHtml, bodyText);
}

export type G2Vars = {
  ref: string;
  booking_person_name: string;
  parent_name: string;
  appointment_date: string;
  appointment_time: string;
};

export function templateG2(v: G2Vars): EmailContent {
  const dateShort = formatAppointmentDateShort(v.appointment_date);
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const subject =
    `Update on ${v.parent_name}'s appointment – ${dateShort} · Ref ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Dear ${escapeHtml(v.booking_person_name)},</p>
    <p style="margin:0 0 12px;">A quick update: our care team is personally arranging a suitable helper for ${escapeHtml(v.parent_name)}'s appointment on ${escapeHtml(dateLong)} at ${escapeHtml(time)}.</p>
    <p style="margin:0 0 12px;">You don't need to do anything. We'll email you the helper's details shortly.</p>
    <p style="margin:0 0 12px;">If you'd like to speak to us, call ${escapeHtml(SUPPORT_PHONE)} and quote Ref ${escapeHtml(v.ref)}.</p>
    <p style="margin:18px 0 0;">Warm regards,<br />The ABI Parent Care team</p>
  `;
  const bodyText = [
    `Dear ${v.booking_person_name},`,
    "",
    `A quick update: our care team is personally arranging a suitable helper for ${v.parent_name}'s appointment on ${dateLong} at ${time}.`,
    "",
    "You don't need to do anything. We'll email you the helper's details shortly.",
    "",
    `If you'd like to speak to us, call ${SUPPORT_PHONE} and quote Ref ${v.ref}.`,
    "",
    "Warm regards,",
    "The ABI Parent Care team",
  ].join("\n");

  return build("G2", subject, v.ref, bodyHtml, bodyText);
}

export type G3Vars = {
  ref: string;
  booking_person_name: string;
  parent_name: string;
  helper_full_name: string;
  helper_phone: string;
  helper_photo_url?: string | null;
  appointment_date: string;
  appointment_time: string;
  doctor_hospital: string;
  address_line1?: string | null;
  street?: string | null;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
};

export function templateG3(v: G3Vars): EmailContent {
  const dateShort = formatAppointmentDateShort(v.appointment_date);
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const pickup = joinAddress([
    v.address_line1,
    v.street,
    v.area,
    v.city,
    v.pincode,
  ]) || "–";
  const subject =
    `Helper confirmed for ${v.parent_name} – ${v.helper_full_name}, ${dateShort} · Ref ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Dear ${escapeHtml(v.booking_person_name)},</p>
    <p style="margin:0 0 12px;">Good news – ${escapeHtml(v.helper_full_name)} will accompany ${escapeHtml(v.parent_name)} to the appointment.</p>
    ${helperPhotoBlock(v.helper_photo_url)}
    ${sectionHeading("Your helper")}
    ${line("Name", v.helper_full_name)}
    ${line("Phone", displayValue(v.helper_phone))}
    ${line("Verified", "ID and background checked by ABI Parent Care")}
    ${sectionHeading("Appointment")}
    ${line("Date & time", `${dateLong} · ${time} (${relative})`)}
    ${line("Doctor/Hospital", displayValue(v.doctor_hospital))}
    ${line("Pickup from", pickup)}
    <p style="margin:16px 0 12px;">For safety, please share this with ${escapeHtml(v.parent_name)} so they know who to expect.</p>
    <p style="margin:18px 0 0;">Warm regards,<br />The ABI Parent Care team</p>
  `;
  const bodyText = [
    `Dear ${v.booking_person_name},`,
    "",
    `Good news – ${v.helper_full_name} will accompany ${v.parent_name} to the appointment.`,
    "",
    "YOUR HELPER",
    textLine("Name", v.helper_full_name),
    textLine("Phone", displayValue(v.helper_phone)),
    textLine("Verified", "ID and background checked by ABI Parent Care"),
    "",
    "APPOINTMENT",
    textLine("Date & time", `${dateLong} · ${time} (${relative})`),
    textLine("Doctor/Hospital", displayValue(v.doctor_hospital)),
    textLine("Pickup from", pickup),
    "",
    `For safety, please share this with ${v.parent_name} so they know who to expect.`,
    "",
    "Warm regards,",
    "The ABI Parent Care team",
  ].join("\n");

  return build("G3", subject, v.ref, bodyHtml, bodyText);
}

export type G4Vars = {
  ref: string;
  booking_person_name: string;
  parent_name: string;
  old_helper_first_name: string;
  appointment_date: string;
  appointment_time: string;
};

export function templateG4(v: G4Vars): EmailContent {
  const dateShort = formatAppointmentDateShort(v.appointment_date);
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const subject =
    `Change of helper for ${v.parent_name} – ${dateShort} · Ref ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Dear ${escapeHtml(v.booking_person_name)},</p>
    <p style="margin:0 0 12px;">We're sorry – ${escapeHtml(v.old_helper_first_name)} is unable to attend ${escapeHtml(v.parent_name)}'s appointment on ${escapeHtml(dateLong)} at ${escapeHtml(time)}.</p>
    <p style="margin:0 0 12px;">Our care team is arranging a replacement as a priority. We'll email you the new helper's details as soon as they're confirmed.</p>
    <p style="margin:0 0 12px;">The appointment itself is unchanged. If you have concerns, call ${escapeHtml(SUPPORT_PHONE)} and quote Ref ${escapeHtml(v.ref)}.</p>
    <p style="margin:18px 0 0;">Warm regards,<br />The ABI Parent Care team</p>
  `;
  const bodyText = [
    `Dear ${v.booking_person_name},`,
    "",
    `We're sorry – ${v.old_helper_first_name} is unable to attend ${v.parent_name}'s appointment on ${dateLong} at ${time}.`,
    "",
    "Our care team is arranging a replacement as a priority. We'll email you the new helper's details as soon as they're confirmed.",
    "",
    `The appointment itself is unchanged. If you have concerns, call ${SUPPORT_PHONE} and quote Ref ${v.ref}.`,
    "",
    "Warm regards,",
    "The ABI Parent Care team",
  ].join("\n");

  return build("G4", subject, v.ref, bodyHtml, bodyText);
}

export type G5Vars = {
  ref: string;
  booking_person_name: string;
  parent_name: string;
  helper_full_name: string;
  helper_phone: string;
  helper_photo_url?: string | null;
  old_helper_first_name: string;
  appointment_date: string;
  appointment_time: string;
  doctor_hospital: string;
};

export function templateG5(v: G5Vars): EmailContent {
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const subject =
    `New helper confirmed for ${v.parent_name} – ${v.helper_full_name} · Ref ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Dear ${escapeHtml(v.booking_person_name)},</p>
    <p style="margin:0 0 12px;">${escapeHtml(v.helper_full_name)} will now accompany ${escapeHtml(v.parent_name)} to the appointment, in place of ${escapeHtml(v.old_helper_first_name)}.</p>
    ${helperPhotoBlock(v.helper_photo_url)}
    ${sectionHeading("Your new helper")}
    ${line("Name", v.helper_full_name)}
    ${line("Phone", displayValue(v.helper_phone))}
    ${line("Verified", "ID and background checked by ABI Parent Care")}
    ${sectionHeading("Appointment (unchanged)")}
    ${line("Date & time", `${dateLong} · ${time} (${relative})`)}
    ${line("Doctor/Hospital", displayValue(v.doctor_hospital))}
    <p style="margin:16px 0 12px;">Thank you for your patience.</p>
    <p style="margin:18px 0 0;">Warm regards,<br />The ABI Parent Care team</p>
  `;
  const bodyText = [
    `Dear ${v.booking_person_name},`,
    "",
    `${v.helper_full_name} will now accompany ${v.parent_name} to the appointment, in place of ${v.old_helper_first_name}.`,
    "",
    "YOUR NEW HELPER",
    textLine("Name", v.helper_full_name),
    textLine("Phone", displayValue(v.helper_phone)),
    textLine("Verified", "ID and background checked by ABI Parent Care"),
    "",
    "APPOINTMENT (unchanged)",
    textLine("Date & time", `${dateLong} · ${time} (${relative})`),
    textLine("Doctor/Hospital", displayValue(v.doctor_hospital)),
    "",
    "Thank you for your patience.",
    "",
    "Warm regards,",
    "The ABI Parent Care team",
  ].join("\n");

  return build("G5", subject, v.ref, bodyHtml, bodyText);
}

// ---------------------------------------------------------------------------
// Helper emails
// ---------------------------------------------------------------------------

export type H1Vars = {
  ref: string;
  helper_first_name: string;
  appointment_date: string;
  appointment_time: string;
  area?: string | null;
  pincode?: string | null;
  distance_km?: number | null;
  doctor_hospital: string;
  parent_age: number;
  accept_url: string;
  decline_url: string;
};

export function templateH1(v: H1Vars): EmailContent {
  const dateShort = formatAppointmentDateShort(v.appointment_date);
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const dist = v.distance_km == null || Number.isNaN(Number(v.distance_km))
    ? "–"
    : String(Math.round(Number(v.distance_km) * 10) / 10);
  const area = displayValue(v.area);
  const subject =
    `New visit near you – ${dateShort}, ${time} · ${area} (${dist} km)`;

  // H1 must NEVER include patient name, address or family contact.
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.helper_first_name)},</p>
    <p style="margin:0 0 12px;">A new hospital visit is available near you. The first helper to accept gets it.</p>
    ${line("When", `${dateLong} · ${time} (${relative})`)}
    ${line("Pickup area", `${area}, ${displayValue(v.pincode)} · about ${dist} km from you`)}
    ${line("Hospital", displayValue(v.doctor_hospital))}
    ${line("Patient", `Age ${v.parent_age}`)}
    <p style="margin:22px 0;">
      ${emailButtonHtml(v.accept_url, "Accept", "primary")}
      ${emailButtonHtml(v.decline_url, "Decline", "secondary")}
    </p>
    <p style="margin:0 0 12px;">The patient's name, full address and family contact are shared after you accept.</p>
    <p style="margin:0;color:#6b7280;">Ref ${escapeHtml(v.ref)}</p>
  `;
  const bodyText = [
    `Hi ${v.helper_first_name},`,
    "",
    "A new hospital visit is available near you. The first helper to accept gets it.",
    "",
    textLine("When", `${dateLong} · ${time} (${relative})`),
    textLine(
      "Pickup area",
      `${area}, ${displayValue(v.pincode)} · about ${dist} km from you`,
    ),
    textLine("Hospital", displayValue(v.doctor_hospital)),
    textLine("Patient", `Age ${v.parent_age}`),
    "",
    `Accept: ${v.accept_url}`,
    `Decline: ${v.decline_url}`,
    "",
    "The patient's name, full address and family contact are shared after you accept.",
    "",
    `Ref ${v.ref}`,
  ].join("\n");

  return build("H1", subject, v.ref, bodyHtml, bodyText);
}

export type H2Vars = {
  ref: string;
  helper_first_name: string;
  parent_name: string;
  parent_age: number;
  address_line1?: string | null;
  street?: string | null;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
  landmark?: string | null;
  maps_url: string;
  appointment_date: string;
  appointment_time: string;
  doctor_hospital: string;
  booking_person_name: string;
  relationship: string;
  guardian_phone: string;
  cant_make_it_url: string;
};

export function templateH2(v: H2Vars): EmailContent {
  const dateShort = formatAppointmentDateShort(v.appointment_date);
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const pickup = joinAddress([
    v.address_line1,
    v.street,
    v.area,
    v.city,
    v.pincode,
  ]) || "–";
  const subject =
    `Confirmed: ${v.parent_name}, ${dateShort} ${time} · Ref ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.helper_first_name)},</p>
    <p style="margin:0 0 12px;">This visit is yours. Thank you!</p>
    ${sectionHeading("Patient")}
    ${line("Name", `${v.parent_name}, ${v.parent_age}`)}
    ${line("Pickup", pickup)}
    ${line("Landmark", displayValue(v.landmark))}
    <p style="margin:10px 0 16px;">${emailButtonHtml(v.maps_url, "Open in Google Maps", "secondary")}</p>
    ${sectionHeading("Appointment")}
    ${line("When", `${dateLong} · ${time} (${relative})`)}
    ${line("Hospital", displayValue(v.doctor_hospital))}
    ${sectionHeading("Family contact")}
    <p style="margin:0 0 12px;">${escapeHtml(v.booking_person_name)} (${escapeHtml(displayValue(v.relationship))}) · ${escapeHtml(displayValue(v.guardian_phone))}</p>
    <p style="margin:0 0 12px;">We'll remind you 12 hours and 6 hours before.</p>
    <p style="margin:0 0 12px;">Can't make it? Tell us as early as possible:</p>
    <p style="margin:12px 0 16px;">${emailButtonHtml(v.cant_make_it_url, "Can't make it", "secondary")}</p>
    <p style="margin:0;color:#6b7280;">Ref ${escapeHtml(v.ref)}</p>
  `;
  const bodyText = [
    `Hi ${v.helper_first_name},`,
    "",
    "This visit is yours. Thank you!",
    "",
    "PATIENT",
    textLine("Name", `${v.parent_name}, ${v.parent_age}`),
    textLine("Pickup", pickup),
    textLine("Landmark", displayValue(v.landmark)),
    `Open in Google Maps: ${v.maps_url}`,
    "",
    "APPOINTMENT",
    textLine("When", `${dateLong} · ${time} (${relative})`),
    textLine("Hospital", displayValue(v.doctor_hospital)),
    "",
    "FAMILY CONTACT",
    `${v.booking_person_name} (${displayValue(v.relationship)}) · ${displayValue(v.guardian_phone)}`,
    "",
    "We'll remind you 12 hours and 6 hours before.",
    "",
    `Can't make it? ${v.cant_make_it_url}`,
    "",
    `Ref ${v.ref}`,
  ].join("\n");

  return build("H2", subject, v.ref, bodyHtml, bodyText);
}

export type H3Vars = {
  ref: string;
  helper_first_name: string;
  parent_name: string;
  area?: string | null;
  appointment_date: string;
  appointment_time: string;
  full_address: string;
  maps_url: string;
  doctor_hospital: string;
  booking_person_name: string;
  relationship: string;
  guardian_phone: string;
  cant_make_it_url: string;
};

export function templateH3(v: H3Vars): EmailContent {
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const subject =
    `Reminder: visit ${relative} ${time} – ${v.parent_name}, ${displayValue(v.area)}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.helper_first_name)},</p>
    <p style="margin:0 0 12px;">A reminder that you're accompanying ${escapeHtml(v.parent_name)} ${escapeHtml(relative)}.</p>
    ${line("When", `${dateLong} · ${time}`)}
    <div style="margin:0 0 6px;"><strong>Pickup:</strong> ${escapeHtml(displayValue(v.full_address))} · <a href="${escapeHtml(v.maps_url)}">Open in Google Maps</a></div>
    ${line("Hospital", displayValue(v.doctor_hospital))}
    ${line("Family", `${v.booking_person_name} (${displayValue(v.relationship)}) · ${displayValue(v.guardian_phone)}`)}
    <p style="margin:16px 0 12px;">Plan to reach the pickup address 15 minutes early.</p>
    <p style="margin:0 0 12px;">Can't make it?</p>
    <p style="margin:12px 0 16px;">${emailButtonHtml(v.cant_make_it_url, "Can't make it", "secondary")}</p>
    <p style="margin:0;color:#6b7280;">Ref ${escapeHtml(v.ref)}</p>
  `;
  const bodyText = [
    `Hi ${v.helper_first_name},`,
    "",
    `A reminder that you're accompanying ${v.parent_name} ${relative}.`,
    "",
    textLine("When", `${dateLong} · ${time}`),
    textLine("Pickup", `${displayValue(v.full_address)} · ${v.maps_url}`),
    textLine("Hospital", displayValue(v.doctor_hospital)),
    textLine(
      "Family",
      `${v.booking_person_name} (${displayValue(v.relationship)}) · ${displayValue(v.guardian_phone)}`,
    ),
    "",
    "Plan to reach the pickup address 15 minutes early.",
    "",
    `Can't make it? ${v.cant_make_it_url}`,
    "",
    `Ref ${v.ref}`,
  ].join("\n");

  return build("H3", subject, v.ref, bodyHtml, bodyText);
}

export type H4Vars = H3Vars & {
  confirm_url: string;
};

export function templateH4(v: H4Vars): EmailContent {
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const subject =
    `Please confirm: ${v.parent_name} at ${time} – ${relative}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.helper_first_name)},</p>
    <p style="margin:0 0 12px;">Your visit with ${escapeHtml(v.parent_name)} is ${escapeHtml(relative)}. Please confirm you'll be there.</p>
    <p style="margin:18px 0;">
      ${emailButtonHtml(v.confirm_url, "I'll be there", "primary")}
      ${emailButtonHtml(v.cant_make_it_url, "Can't make it", "secondary")}
    </p>
    ${line("When", `${dateLong} · ${time}`)}
    <div style="margin:0 0 6px;"><strong>Pickup:</strong> ${escapeHtml(displayValue(v.full_address))} · <a href="${escapeHtml(v.maps_url)}">Open in Google Maps</a></div>
    ${line("Hospital", displayValue(v.doctor_hospital))}
    ${line("Family", `${v.booking_person_name} (${displayValue(v.relationship)}) · ${displayValue(v.guardian_phone)}`)}
    <p style="margin:16px 0 12px;">If we don't hear from you, our care team will call you.</p>
    <p style="margin:0;color:#6b7280;">Ref ${escapeHtml(v.ref)}</p>
  `;
  const bodyText = [
    `Hi ${v.helper_first_name},`,
    "",
    `Your visit with ${v.parent_name} is ${relative}. Please confirm you'll be there.`,
    "",
    `I'll be there: ${v.confirm_url}`,
    `Can't make it: ${v.cant_make_it_url}`,
    "",
    textLine("When", `${dateLong} · ${time}`),
    textLine("Pickup", `${displayValue(v.full_address)} · ${v.maps_url}`),
    textLine("Hospital", displayValue(v.doctor_hospital)),
    textLine(
      "Family",
      `${v.booking_person_name} (${displayValue(v.relationship)}) · ${displayValue(v.guardian_phone)}`,
    ),
    "",
    "If we don't hear from you, our care team will call you.",
    "",
    `Ref ${v.ref}`,
  ].join("\n");

  return build("H4", subject, v.ref, bodyHtml, bodyText);
}

export type H5Vars = {
  helper_first_name: string;
  helper_email: string;
  helper_app_link?: string;
};

export function templateH5(v: H5Vars): EmailContent {
  const link = v.helper_app_link || HELPER_APP_LINK;
  const subject = "Welcome to ABI Parent Care – your helper app login";

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.helper_first_name)},</p>
    <p style="margin:0 0 12px;">Welcome to the ABI Parent Care team! Your profile is verified and your helper app account is ready.</p>
    ${line("App link", link)}
    ${line("Login email", v.helper_email)}
    ${line("Password", "the temporary password given to you by your manager")}
    <p style="margin:16px 0 12px;">You'll be asked to set your own password the first time you log in.</p>
    <p style="margin:0 0 12px;">Tip: open the link on your phone and choose "Add to Home screen" to use it like an app.</p>
    <p style="margin:16px 0;">${emailButtonHtml(link, "Open helper app", "primary")}</p>
    <p style="margin:0 0 12px;">Questions? Call ${escapeHtml(SUPPORT_PHONE)}.</p>
    <p style="margin:18px 0 0;">The ABI Parent Care team</p>
  `;
  const bodyText = [
    `Hi ${v.helper_first_name},`,
    "",
    "Welcome to the ABI Parent Care team! Your profile is verified and your helper app account is ready.",
    "",
    textLine("App link", link),
    textLine("Login email", v.helper_email),
    textLine("Password", "the temporary password given to you by your manager"),
    "",
    "You'll be asked to set your own password the first time you log in.",
    "",
    'Tip: open the link on your phone and choose "Add to Home screen" to use it like an app.',
    "",
    `Questions? Call ${SUPPORT_PHONE}.`,
    "",
    "The ABI Parent Care team",
  ].join("\n");

  return build("H5", subject, null, bodyHtml, bodyText);
}

// ---------------------------------------------------------------------------
// Manager emails
// ---------------------------------------------------------------------------

export type M1Vars = {
  ref: string;
  manager_first_name: string;
  parent_name: string;
  parent_age: number;
  appointment_date: string;
  appointment_time: string;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
  doctor_hospital: string;
  helper_preference?: string | null;
  booking_person_name: string;
  relationship: string;
  guardian_phone: string;
  time_remaining: string;
  assign_url: string;
};

export function templateM1(v: M1Vars): EmailContent {
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const subject =
    `URGENT – Helper needed in ${v.time_remaining} · ${v.parent_name} (${v.parent_age}) · ${time} · ${displayValue(v.area)} · ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.manager_first_name)},</p>
    <p style="margin:0 0 12px;">A booking has come in for ${escapeHtml(relative)}. There isn't time to send offers automatically, so please assign a helper now.</p>
    ${sectionHeading("What to do now")}
    <p style="margin:0 0 12px;">Open the request, pick an available helper and send them an offer.</p>
    ${sectionHeading("Visit details")}
    ${line("Patient", `${v.parent_name}, ${v.parent_age}`)}
    ${line("When", `${dateLong} · ${time} (${relative})`)}
    ${line("Pickup", joinAddress([v.area, v.city, v.pincode]) || "–")}
    ${line("Hospital", displayValue(v.doctor_hospital))}
    ${line("Preference", preferenceLabel(v.helper_preference))}
    ${line("Family", `${v.booking_person_name} (${displayValue(v.relationship)}) · ${displayValue(v.guardian_phone)}`)}
    <p style="margin:22px 0;">${emailButtonHtml(v.assign_url, "Assign a helper", "primary")}</p>
  `;
  const bodyText = [
    `Hi ${v.manager_first_name},`,
    "",
    `A booking has come in for ${relative}. There isn't time to send offers automatically, so please assign a helper now.`,
    "",
    "WHAT TO DO NOW",
    "Open the request, pick an available helper and send them an offer.",
    "",
    "VISIT DETAILS",
    textLine("Patient", `${v.parent_name}, ${v.parent_age}`),
    textLine("When", `${dateLong} · ${time} (${relative})`),
    textLine("Pickup", joinAddress([v.area, v.city, v.pincode]) || "–"),
    textLine("Hospital", displayValue(v.doctor_hospital)),
    textLine("Preference", preferenceLabel(v.helper_preference)),
    textLine(
      "Family",
      `${v.booking_person_name} (${displayValue(v.relationship)}) · ${displayValue(v.guardian_phone)}`,
    ),
    "",
    `Assign a helper: ${v.assign_url}`,
  ].join("\n");

  return build("M1", subject, v.ref, bodyHtml, bodyText);
}

export type M2Item = {
  ref: string;
  parent_name: string;
  parent_age: number;
  appointment_date: string;
  appointment_time: string;
  area?: string | null;
  pincode?: string | null;
  helper_preference?: string | null;
  reason?: string | null;
  assign_url: string;
};

export type M2Vars = {
  manager_first_name: string;
  digest_time: string;
  open_all_url: string;
  items: M2Item[];
};

export function templateM2(v: M2Vars): EmailContent {
  const count = v.items.length;
  const subject = `${count} request(s) need a helper – ${v.digest_time}`;

  const itemsHtml = v.items.map((item, i) => {
    const dateShort = formatAppointmentDateShort(item.appointment_date);
    const time = timeLabel(item.appointment_time);
    const relative = formatRelativeTime(
      item.appointment_date,
      item.appointment_time,
    );
    return `
      <div style="margin:0 0 16px;padding:12px 0;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 6px;"><strong>${i + 1}. ${escapeHtml(item.ref)}</strong> · ${escapeHtml(item.parent_name)} (${item.parent_age}) · ${escapeHtml(dateShort)} ${escapeHtml(time)} (${escapeHtml(relative)})</p>
        <p style="margin:0 0 6px;">${escapeHtml(displayValue(item.area))} ${escapeHtml(displayValue(item.pincode))} · Preference: ${escapeHtml(preferenceLabel(item.helper_preference))}</p>
        <p style="margin:0 0 10px;">Why: ${escapeHtml(reasonPlain(item.reason))}</p>
        <p style="margin:0;">${emailButtonHtml(item.assign_url, "Assign", "primary")}</p>
      </div>
    `;
  }).join("");

  const itemsText = v.items.map((item, i) => {
    const dateShort = formatAppointmentDateShort(item.appointment_date);
    const time = timeLabel(item.appointment_time);
    const relative = formatRelativeTime(
      item.appointment_date,
      item.appointment_time,
    );
    return [
      `${i + 1}. ${item.ref} · ${item.parent_name} (${item.parent_age}) · ${dateShort} ${time} (${relative})`,
      `   ${displayValue(item.area)} ${displayValue(item.pincode)} · Preference: ${preferenceLabel(item.helper_preference)}`,
      `   Why: ${reasonPlain(item.reason)}`,
      `   Assign: ${item.assign_url}`,
    ].join("\n");
  }).join("\n\n");

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.manager_first_name)},</p>
    <p style="margin:0 0 12px;">These requests still need a helper. The soonest appointment is first.</p>
    ${itemsHtml}
    <p style="margin:22px 0;">${emailButtonHtml(v.open_all_url, "Open all in the portal", "primary")}</p>
  `;
  const bodyText = [
    `Hi ${v.manager_first_name},`,
    "",
    "These requests still need a helper. The soonest appointment is first.",
    "",
    itemsText,
    "",
    `Open all in the portal: ${v.open_all_url}`,
  ].join("\n");

  return build("M2", subject, null, bodyHtml, bodyText);
}

export type M3Vars = {
  ref: string;
  manager_first_name: string;
  helper_full_name: string;
  parent_name: string;
  appointment_date: string;
  appointment_time: string;
  area?: string | null;
  decline_reason?: string | null;
  assign_url: string;
};

export function templateM3(v: M3Vars): EmailContent {
  const dateShort = formatAppointmentDateShort(v.appointment_date);
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const reason = displayOrNone(v.decline_reason);
  const subject =
    `${v.helper_full_name} declined – please assign another · ${v.parent_name}, ${dateShort} ${time} · ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.manager_first_name)},</p>
    <p style="margin:0 0 12px;">${escapeHtml(v.helper_full_name)} declined the visit you offered.</p>
    ${line("Reason given", reason)}
    <p style="margin:12px 0;">Appointment: ${escapeHtml(dateLong)} · ${escapeHtml(time)} (${escapeHtml(relative)}) · ${escapeHtml(displayValue(v.area))}</p>
    <p style="margin:22px 0;">${emailButtonHtml(v.assign_url, "Choose another helper", "primary")}</p>
  `;
  const bodyText = [
    `Hi ${v.manager_first_name},`,
    "",
    `${v.helper_full_name} declined the visit you offered.`,
    textLine("Reason given", reason),
    "",
    `Appointment: ${dateLong} · ${time} (${relative}) · ${displayValue(v.area)}`,
    "",
    `Choose another helper: ${v.assign_url}`,
  ].join("\n");

  return build("M3", subject, v.ref, bodyHtml, bodyText);
}

export type M4Vars = {
  ref: string;
  manager_first_name: string;
  helper_full_name: string;
  helper_phone?: string | null;
  parent_name: string;
  appointment_date: string;
  appointment_time: string;
  area?: string | null;
  expiry_window: string;
  assign_url: string;
};

export function templateM4(v: M4Vars): EmailContent {
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const subject =
    `No response from ${v.helper_full_name} – please assign another · ${v.parent_name} · ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.manager_first_name)},</p>
    <p style="margin:0 0 12px;">${escapeHtml(v.helper_full_name)} didn't respond within ${escapeHtml(v.expiry_window)}, so the offer has been withdrawn.</p>
    <p style="margin:0 0 8px;">Appointment: ${escapeHtml(dateLong)} · ${escapeHtml(time)} (${escapeHtml(relative)}) · ${escapeHtml(displayValue(v.area))}</p>
    <p style="margin:0 0 12px;">Helper phone (if you'd like to call): ${escapeHtml(displayValue(v.helper_phone))}</p>
    <p style="margin:22px 0;">${emailButtonHtml(v.assign_url, "Choose another helper", "primary")}</p>
  `;
  const bodyText = [
    `Hi ${v.manager_first_name},`,
    "",
    `${v.helper_full_name} didn't respond within ${v.expiry_window}, so the offer has been withdrawn.`,
    "",
    `Appointment: ${dateLong} · ${time} (${relative}) · ${displayValue(v.area)}`,
    `Helper phone (if you'd like to call): ${displayValue(v.helper_phone)}`,
    "",
    `Choose another helper: ${v.assign_url}`,
  ].join("\n");

  return build("M4", subject, v.ref, bodyHtml, bodyText);
}

export type M5Vars = {
  ref: string;
  manager_first_name: string;
  helper_full_name: string;
  parent_name: string;
  parent_age: number;
  appointment_date: string;
  appointment_time: string;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
  doctor_hospital: string;
  booking_person_name: string;
  relationship: string;
  guardian_phone: string;
  dropout_reason?: string | null;
  assign_url: string;
};

export function templateM5(v: M5Vars): EmailContent {
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const reason = displayOrNone(v.dropout_reason);
  const subject =
    `URGENT – ${v.helper_full_name} can't attend · ${v.parent_name} · ${time} (${relative}) · ${v.ref}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.manager_first_name)},</p>
    <p style="margin:0 0 12px;">${escapeHtml(v.helper_full_name)} has said they can't attend this visit.</p>
    ${line("Reason given", reason)}
    <p style="margin:12px 0;">The family has been told we're arranging a replacement. Please assign a new helper now.</p>
    ${sectionHeading("Visit details")}
    ${line("Patient", `${v.parent_name}, ${v.parent_age}`)}
    ${line("When", `${dateLong} · ${time} (${relative})`)}
    ${line("Pickup", joinAddress([v.area, v.city, v.pincode]) || "–")}
    ${line("Hospital", displayValue(v.doctor_hospital))}
    ${line("Family", `${v.booking_person_name} (${displayValue(v.relationship)}) · ${displayValue(v.guardian_phone)}`)}
    <p style="margin:22px 0;">${emailButtonHtml(v.assign_url, "Assign a replacement", "primary")}</p>
  `;
  const bodyText = [
    `Hi ${v.manager_first_name},`,
    "",
    `${v.helper_full_name} has said they can't attend this visit.`,
    textLine("Reason given", reason),
    "",
    "The family has been told we're arranging a replacement. Please assign a new helper now.",
    "",
    "VISIT DETAILS",
    textLine("Patient", `${v.parent_name}, ${v.parent_age}`),
    textLine("When", `${dateLong} · ${time} (${relative})`),
    textLine("Pickup", joinAddress([v.area, v.city, v.pincode]) || "–"),
    textLine("Hospital", displayValue(v.doctor_hospital)),
    textLine(
      "Family",
      `${v.booking_person_name} (${displayValue(v.relationship)}) · ${displayValue(v.guardian_phone)}`,
    ),
    "",
    `Assign a replacement: ${v.assign_url}`,
  ].join("\n");

  return build("M5", subject, v.ref, bodyHtml, bodyText);
}

export type M6Vars = {
  ref: string;
  manager_first_name: string;
  helper_full_name: string;
  helper_first_name: string;
  helper_phone: string;
  parent_name: string;
  parent_age: number;
  appointment_date: string;
  appointment_time: string;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
  doctor_hospital: string;
  assigned_at?: string | null;
  r12_status: string;
  r6_status: string;
  open_url: string;
  urgent?: boolean;
};

export function templateM6(v: M6Vars): EmailContent {
  const dateLong = formatAppointmentDateLong(v.appointment_date);
  const time = timeLabel(v.appointment_time);
  const relative = formatRelativeTime(v.appointment_date, v.appointment_time);
  const assigned = formatIstDateTime(v.assigned_at);
  const subject = v.urgent
    ? `URGENT – visit in 1 hour, ${v.helper_full_name} still not confirmed · ${v.parent_name} · ${v.ref}`
    : `Action needed – ${v.helper_full_name} hasn't confirmed · ${v.parent_name} · ${time} (${relative}) · ${v.ref}`;

  const lead = v.urgent
    ? `The visit starts in about 1 hour and ${escapeHtml(v.helper_full_name)} still hasn't confirmed. Please resolve this now.`
    : `${escapeHtml(v.helper_full_name)} hasn't yet confirmed they'll attend this visit. The family has not been informed.`;

  const leadText = v.urgent
    ? `The visit starts in about 1 hour and ${v.helper_full_name} still hasn't confirmed. Please resolve this now.`
    : `${v.helper_full_name} hasn't yet confirmed they'll attend this visit. The family has not been informed.`;

  const stepsHtml = v.urgent
    ? `<ol style="margin:0 0 12px;padding-left:20px;">
        <li>Call ${escapeHtml(v.helper_first_name)}: ${escapeHtml(displayValue(v.helper_phone))}</li>
        <li>Mark "Helper confirmed by phone", or choose "Helper unable – reassign".</li>
      </ol>`
    : `${sectionHeading("What to do now")}
      <ol style="margin:0 0 12px;padding-left:20px;">
        <li>Call ${escapeHtml(v.helper_first_name)}: ${escapeHtml(displayValue(v.helper_phone))}</li>
        <li>Then in the portal, choose:
          <ul style="margin:8px 0 0;padding-left:18px;">
            <li>Helper confirmed by phone – nothing else happens, or</li>
            <li>Helper unable – reassign – we'll inform the family and you can pick a new helper</li>
          </ul>
        </li>
      </ol>`;

  const stepsText = v.urgent
    ? [
      `1. Call ${v.helper_first_name}: ${displayValue(v.helper_phone)}`,
      `2. Mark "Helper confirmed by phone", or choose "Helper unable – reassign".`,
    ].join("\n")
    : [
      "WHAT TO DO NOW",
      `1. Call ${v.helper_first_name}: ${displayValue(v.helper_phone)}`,
      "2. Then in the portal, choose:",
      "   • Helper confirmed by phone – nothing else happens, or",
      "   • Helper unable – reassign – we'll inform the family and you can pick a new helper",
    ].join("\n");

  const detailsHtml = `
    ${sectionHeading("Visit details")}
    ${line("Patient", `${v.parent_name}, ${v.parent_age}`)}
    ${line("When", `${dateLong} · ${time} (${relative})`)}
    ${line("Pickup", joinAddress([v.area, v.city, v.pincode]) || "–")}
    ${line("Hospital", displayValue(v.doctor_hospital))}
    ${sectionHeading("Helper status")}
    ${line("Assigned", assigned)}
    ${line("Reminders", `12-hour ${v.r12_status} · 6-hour ${v.r6_status}`)}
    ${line("Confirmed", "Not yet")}
  `;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.manager_first_name)},</p>
    <p style="margin:0 0 12px;">${lead}</p>
    ${stepsHtml}
    ${detailsHtml}
    <p style="margin:22px 0;">${emailButtonHtml(v.open_url, "Open request", "primary")}</p>
  `;
  const bodyText = [
    `Hi ${v.manager_first_name},`,
    "",
    leadText,
    "",
    stepsText,
    "",
    "VISIT DETAILS",
    textLine("Patient", `${v.parent_name}, ${v.parent_age}`),
    textLine("When", `${dateLong} · ${time} (${relative})`),
    textLine("Pickup", joinAddress([v.area, v.city, v.pincode]) || "–"),
    textLine("Hospital", displayValue(v.doctor_hospital)),
    "",
    "HELPER STATUS",
    textLine("Assigned", assigned),
    textLine("Reminders", `12-hour ${v.r12_status} · 6-hour ${v.r6_status}`),
    textLine("Confirmed", "Not yet"),
    "",
    `Open request: ${v.open_url}`,
  ].join("\n");

  return build(v.urgent ? "M7" : "M6", subject, v.ref, bodyHtml, bodyText);
}

export function templateM7(v: M6Vars): EmailContent {
  return templateM6({ ...v, urgent: true });
}

export type M8Vars = {
  manager_first_name: string;
  helper_full_name: string;
  expiry_phrase: string;
  dl_expiry: string;
  upcoming_count: number;
  open_url: string;
  expired: boolean;
};

export function templateM8(v: M8Vars): EmailContent {
  const subject =
    `Driving licence ${v.expiry_phrase} – ${v.helper_full_name}`;

  const statusHtml = v.expired
    ? `<p style="margin:0 0 12px;">If expired: They've been paused and won't receive offers until a renewed licence is recorded. Upcoming visits: ${v.upcoming_count} (moved to Needs action).</p>`
    : `<p style="margin:0 0 12px;">If not yet expired: Please ask them for the renewed licence before this date to avoid a pause.</p>`;

  const statusText = v.expired
    ? `If expired: They've been paused and won't receive offers until a renewed licence is recorded. Upcoming visits: ${v.upcoming_count} (moved to Needs action).`
    : "If not yet expired: Please ask them for the renewed licence before this date to avoid a pause.";

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.manager_first_name)},</p>
    <p style="margin:0 0 12px;">${escapeHtml(v.helper_full_name)}'s driving licence ${escapeHtml(v.expiry_phrase)} (${escapeHtml(v.dl_expiry)}).</p>
    ${statusHtml}
    <p style="margin:22px 0;">${emailButtonHtml(v.open_url, "Open helper profile", "primary")}</p>
  `;
  const bodyText = [
    `Hi ${v.manager_first_name},`,
    "",
    `${v.helper_full_name}'s driving licence ${v.expiry_phrase} (${v.dl_expiry}).`,
    "",
    statusText,
    "",
    `Open helper profile: ${v.open_url}`,
  ].join("\n");

  return build("M8", subject, null, bodyHtml, bodyText);
}

export type M9Vars = {
  manager_first_name: string;
  helper_full_name: string;
  request_note: string;
  open_url: string;
};

export function templateM9(v: M9Vars): EmailContent {
  const subject = `Profile change request – ${v.helper_full_name}`;
  const note = displayOrNone(v.request_note);

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(v.manager_first_name)},</p>
    <p style="margin:0 0 12px;">${escapeHtml(v.helper_full_name)} has asked to update their profile:</p>
    <p style="margin:0 0 12px;padding:12px 14px;background:#f3f6fb;border-radius:8px;font-style:italic;">"${escapeHtml(note)}"</p>
    <p style="margin:0 0 12px;">Please review and update their details in the portal if appropriate.</p>
    <p style="margin:22px 0;">${emailButtonHtml(v.open_url, "Open helper profile", "primary")}</p>
  `;
  const bodyText = [
    `Hi ${v.manager_first_name},`,
    "",
    `${v.helper_full_name} has asked to update their profile:`,
    "",
    `"${note}"`,
    "",
    "Please review and update their details in the portal if appropriate.",
    "",
    `Open helper profile: ${v.open_url}`,
  ].join("\n");

  return build("M9", subject, null, bodyHtml, bodyText);
}

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
