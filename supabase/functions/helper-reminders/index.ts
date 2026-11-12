import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  createRawToken,
  reminderEmail,
  type RequestContact,
} from "../_shared/assignment.ts";
import { sendEmail } from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  MANAGER_FIRST_NAME,
  firstName,
  reminderStatusLabel,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import { templateM6, templateM7 } from "../_shared/templates-m.ts";

type AssignedRow = {
  id: string;
  ref_number?: string | null;
  status: string;
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
  assigned_helper_id: string;
  assigned_at: string;
  helper_confirmed_at: string | null;
  reminder_12h_sent_at: string | null;
  reminder_6h_sent_at: string | null;
  no_confirm_alert_sent_at: string | null;
  no_confirm_second_alert_sent_at: string | null;
};

type HelperRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
}

function asContact(row: AssignedRow): RequestContact {
  return {
    ref_number: row.ref_number,
    parent_name: row.parent_name,
    parent_age: row.parent_age,
    address_line1: row.address_line1,
    street: row.street,
    area: row.area,
    landmark: row.landmark,
    city: row.city,
    pincode: row.pincode,
    appointment_date: row.appointment_date,
    appointment_time: row.appointment_time,
    doctor_hospital: row.doctor_hospital,
    booking_person_name: row.booking_person_name,
    relationship: row.relationship,
    phone_country_code: row.phone_country_code,
    phone: row.phone,
  };
}

function appointmentMs(row: AssignedRow): number {
  return Date.parse(
    `${row.appointment_date}T${String(row.appointment_time).slice(0, 8)}+05:30`,
  );
}

async function ensureAssignmentToken(
  supabase: SupabaseClient,
  requestId: string,
  helperId: string,
): Promise<string | null> {
  const { token, hash } = await createRawToken();
  const { data, error } = await supabase.rpc("create_assignment_token", {
    p_request_id: requestId,
    p_helper_id: helperId,
    p_token_hash: hash,
  });
  if (error) {
    console.error("create_assignment_token", error);
    return null;
  }
  const result = data as { ok?: boolean };
  if (!result?.ok) return null;
  return token;
}

async function markSent(
  supabase: SupabaseClient,
  requestId: string,
  column: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("consultation_requests")
    .update({ [column]: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "assigned")
    .is(column, null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error(`markSent ${column}`, error);
    return false;
  }
  return Boolean(data?.id);
}

async function processReminders(
  supabase: SupabaseClient,
  rows: AssignedRow[],
  helpersById: Map<string, HelperRow>,
) {
  const results: Record<string, unknown>[] = [];

  for (const row of rows) {
    if (row.status !== "assigned") continue;
    const helper = helpersById.get(row.assigned_helper_id);
    if (!helper) continue;

    const appt = appointmentMs(row);
    const assignedAt = Date.parse(row.assigned_at);
    if (!Number.isFinite(appt) || !Number.isFinite(assignedAt)) continue;

    const hoursLead = (appt - assignedAt) / 3600000;
    const skip12 = hoursLead < 12;
    const skipBoth = hoursLead < 6;

    const { data: rem12 } = await supabase.rpc("effective_reminder_at", {
      p_appointment: new Date(appt).toISOString(),
      p_hours_before: 12,
      p_assigned_at: row.assigned_at,
    });
    const { data: rem6 } = await supabase.rpc("effective_reminder_at", {
      p_appointment: new Date(appt).toISOString(),
      p_hours_before: 6,
      p_assigned_at: row.assigned_at,
    });

    const now = Date.now();
    const due12 = typeof rem12 === "string" ? Date.parse(rem12) : NaN;
    const due6 = typeof rem6 === "string" ? Date.parse(rem6) : NaN;

    const entry: Record<string, unknown> = {
      request_id: row.id,
      helper_id: helper.id,
      hours_lead: Math.round(hoursLead * 100) / 100,
      skip12,
      skipBoth,
      due12: rem12,
      due6: rem6,
    };

    if (
      !skipBoth &&
      !skip12 &&
      !row.reminder_12h_sent_at &&
      Number.isFinite(due12) &&
      now >= due12
    ) {
      const claimed = await markSent(supabase, row.id, "reminder_12h_sent_at");
      if (claimed) {
        const token = await ensureAssignmentToken(
          supabase,
          row.id,
          helper.id,
        );
        if (token) {
          const email = reminderEmail(
            asContact(row),
            helper.full_name,
            token,
            "12h",
          );
          const sent = await sendEmail({
            to: helper.email,
            toName: helper.full_name,
            subject: email.subject,
            html: email.html,
            text: email.text,
          });
          entry.reminder_12h = { sent: sent.ok };
        } else {
          entry.reminder_12h = { sent: false, error: "token_failed" };
        }
      } else {
        entry.reminder_12h = { skipped: "already_sent" };
      }
    }

    if (
      !skipBoth &&
      !row.reminder_6h_sent_at &&
      Number.isFinite(due6) &&
      now >= due6
    ) {
      const claimed = await markSent(supabase, row.id, "reminder_6h_sent_at");
      if (claimed) {
        const token = await ensureAssignmentToken(
          supabase,
          row.id,
          helper.id,
        );
        if (token) {
          const email = reminderEmail(
            asContact(row),
            helper.full_name,
            token,
            "6h",
          );
          const sent = await sendEmail({
            to: helper.email,
            toName: helper.full_name,
            subject: email.subject,
            html: email.html,
            text: email.text,
          });
          entry.reminder_6h = { sent: sent.ok };
        } else {
          entry.reminder_6h = { sent: false, error: "token_failed" };
        }
      } else {
        entry.reminder_6h = { skipped: "already_sent" };
      }
    }

    results.push(entry);
  }

  return results;
}

async function processNoConfirmAlerts(
  supabase: SupabaseClient,
  rows: AssignedRow[],
  helpersById: Map<string, HelperRow>,
) {
  const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
  const results: Record<string, unknown>[] = [];

  if (!seniorEmail) {
    return [{ error: "missing_senior_secrets" }];
  }

  for (const row of rows) {
    if (row.helper_confirmed_at) continue;
    const helper = helpersById.get(row.assigned_helper_id);
    if (!helper) continue;

    const appt = appointmentMs(row);
    if (!Number.isFinite(appt)) continue;
    const hoursLeft = (appt - Date.now()) / 3600000;
    const assignUrl = seniorAssignUrl(row.id);
    const m6base = {
      ref: String(row.ref_number ?? "–"),
      manager_first_name: MANAGER_FIRST_NAME,
      helper_full_name: helper.full_name,
      helper_first_name: firstName(helper.full_name),
      helper_phone: helper.phone,
      parent_name: row.parent_name,
      parent_age: row.parent_age,
      appointment_date: row.appointment_date,
      appointment_time: row.appointment_time,
      area: row.area,
      city: row.city,
      pincode: row.pincode,
      doctor_hospital: row.doctor_hospital,
      assigned_at: row.assigned_at,
      r12_status: reminderStatusLabel(row.reminder_12h_sent_at),
      r6_status: reminderStatusLabel(row.reminder_6h_sent_at),
      open_url: assignUrl,
    };
    const entry: Record<string, unknown> = {
      request_id: row.id,
      hours_left: Math.round(hoursLeft * 100) / 100,
    };

    if (hoursLeft <= 3 && hoursLeft > 0 && !row.no_confirm_alert_sent_at) {
      const claimed = await markSent(
        supabase,
        row.id,
        "no_confirm_alert_sent_at",
      );
      if (claimed) {
        const email = templateM6(m6base);
        const sent = await sendEmail({
          to: seniorEmail,
          toName: "Senior coordinator",
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        entry.alert_3h = { sent: sent.ok };
      }
    }

    if (
      hoursLeft <= 1 &&
      hoursLeft > 0 &&
      !row.no_confirm_second_alert_sent_at
    ) {
      // Refresh confirmation state in case it changed mid-loop
      const { data: fresh } = await supabase
        .from("consultation_requests")
        .select("helper_confirmed_at, status, assigned_helper_id")
        .eq("id", row.id)
        .maybeSingle();
      if (
        fresh?.status === "assigned" &&
        !fresh.helper_confirmed_at &&
        fresh.assigned_helper_id === row.assigned_helper_id
      ) {
        const claimed = await markSent(
          supabase,
          row.id,
          "no_confirm_second_alert_sent_at",
        );
        if (claimed) {
          const email = templateM7(m6base);
          const sent = await sendEmail({
            to: seniorEmail,
            toName: "Senior coordinator",
            subject: email.subject,
            html: email.html,
            text: email.text,
          });
          entry.alert_1h = { sent: sent.ok };
        }
      }
    }

    results.push(entry);
  }

  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const payload = await req.json().catch(() => ({})) as {
      reason?: string;
      request_id?: string;
    };

    let query = supabase
      .from("consultation_requests")
      .select(
        "id, ref_number, status, parent_name, parent_age, address_line1, street, area, landmark, city, pincode, appointment_date, appointment_time, doctor_hospital, booking_person_name, relationship, phone_country_code, phone, assigned_helper_id, assigned_at, helper_confirmed_at, reminder_12h_sent_at, reminder_6h_sent_at, no_confirm_alert_sent_at, no_confirm_second_alert_sent_at",
      )
      .eq("status", "assigned")
      .not("assigned_helper_id", "is", null);

    if (payload.request_id) {
      query = query.eq("id", payload.request_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as AssignedRow[];
    const helperIds = [...new Set(rows.map((r) => r.assigned_helper_id))];
    const helpersById = new Map<string, HelperRow>();
    if (helperIds.length) {
      const { data: helpers, error: helpersError } = await supabase
        .from("helpers")
        .select("id, full_name, email, phone")
        .in("id", helperIds);
      if (helpersError) throw helpersError;
      for (const helper of (helpers ?? []) as HelperRow[]) {
        helpersById.set(helper.id, helper);
      }
    }

    const reminders = await processReminders(supabase, rows, helpersById);
    const alerts = await processNoConfirmAlerts(supabase, rows, helpersById);

    return jsonResponse({
      ok: true,
      reason: payload.reason ?? "manual",
      assigned_count: rows.length,
      reminders,
      alerts,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
