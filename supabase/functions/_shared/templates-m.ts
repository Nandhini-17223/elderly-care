/**
 * Manager / ops email templates M1–M9.
 */
import {
  displayOrNone,
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
  line,
  preferenceLabel,
  reasonPlain,
  sectionHeading,
  textLine,
  timeLabel,
} from "./templates-common.ts";

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
