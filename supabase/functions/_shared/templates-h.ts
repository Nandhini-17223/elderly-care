/**
 * Helper email templates H1–H5.
 */
import {
  HELPER_APP_LINK,
  SUPPORT_PHONE,
  displayValue,
  emailButtonHtml,
  escapeHtml,
  formatAppointmentDateLong,
  formatAppointmentDateShort,
  formatRelativeTime,
} from "./email.ts";
import {
  type EmailContent,
  build,
  joinAddress,
  line,
  sectionHeading,
  textLine,
  timeLabel,
} from "./templates-common.ts";

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
