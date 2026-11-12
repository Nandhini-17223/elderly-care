/**
 * Guardian email templates G1–G5.
 */
import {
  SUPPORT_PHONE,
  displayValue,
  escapeHtml,
  formatAppointmentDateLong,
  formatAppointmentDateShort,
  formatRelativeTime,
} from "./email.ts";
import {
  type EmailContent,
  build,
  helperPhotoBlock,
  joinAddress,
  line,
  preferenceLabel,
  sectionHeading,
  textLine,
  timeLabel,
} from "./templates-common.ts";

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
