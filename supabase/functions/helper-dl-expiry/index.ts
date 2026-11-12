import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  appointmentLabels,
  formatRemaining,
  guardianReplacementArrangingHtml,
} from "../_shared/assignment.ts";
import { escapeHtml, sendEmail } from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  assignButtonHtml,
  firstName,
  formatRequestSummaryHtml,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import { templateM5, templateM8 } from "../_shared/templates-m.ts";

type HelperRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  dl_expiry: string | null;
  verification_status: string;
  dl_warn_30_sent_at: string | null;
  dl_warn_7_sent_at: string | null;
  dl_expired_notified_at: string | null;
};

type UpcomingJob = {
  request_id: string;
  parent_name: string;
  appointment_date: string;
  appointment_time: string;
  doctor_hospital: string | null;
  area: string | null;
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

function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIst(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T12:00:00+05:30`);
  base.setDate(base.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

async function notifyUnavailable(
  supabase: SupabaseClient,
  requestId: string,
  helper: HelperRow,
  reasonLabel: string,
) {
  const [{ data: request }, seniorEmail] = await Promise.all([
    supabase
      .from("consultation_requests")
      .select(
        "id, ref_number, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, booking_person_name, relationship, phone_country_code, phone, email, address_line1, street, landmark, city",
      )
      .eq("id", requestId)
      .maybeSingle(),
    resolveSecret(supabase, "SENIOR_EMAIL"),
  ]);
  if (!request) return;

  if (seniorEmail) {
    const email = templateM5({
      ref: String(request.ref_number ?? "–"),
      manager_first_name: MANAGER_FIRST_NAME,
      helper_full_name: helper.full_name,
      parent_name: request.parent_name,
      parent_age: request.parent_age,
      appointment_date: request.appointment_date,
      appointment_time: request.appointment_time,
      area: request.area,
      city: request.city,
      pincode: request.pincode,
      doctor_hospital: request.doctor_hospital,
      booking_person_name: request.booking_person_name,
      relationship: String(request.relationship ?? ""),
      guardian_phone: `${request.phone_country_code ?? ""} ${request.phone ?? ""}`.trim(),
      dropout_reason: reasonLabel,
      assign_url: seniorAssignUrl(requestId),
    });
    await sendEmail({
      to: seniorEmail,
      toName: "Senior coordinator",
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  }

  if (request.email) {
    const guardianEmail = guardianReplacementArrangingEmail(
      {
        parent_name: request.parent_name,
        parent_age: request.parent_age,
        address_line1: request.address_line1,
        street: request.street,
        area: request.area,
        landmark: request.landmark,
        city: request.city,
        pincode: request.pincode,
        appointment_date: request.appointment_date,
        appointment_time: request.appointment_time,
        doctor_hospital: request.doctor_hospital,
        booking_person_name: request.booking_person_name,
        relationship: String(request.relationship ?? ""),
        phone_country_code: String(request.phone_country_code ?? ""),
        phone: String(request.phone ?? ""),
        email: request.email,
        ref_number: request.ref_number,
      },
      helper.full_name,
    );
    await sendEmail({
      to: request.email,
      toName: request.booking_person_name,
      subject: guardianEmail.subject,
      html: guardianEmail.html,
      text: guardianEmail.text,
    });
  }
}

async function releaseUpcomingJobs(
  supabase: SupabaseClient,
  helper: HelperRow,
) {
  const { data: jobs, error } = await supabase.rpc(
    "list_helper_upcoming_assigned_jobs",
    { p_helper_id: helper.id },
  );
  if (error) throw error;

  const released: string[] = [];
  for (const job of (jobs ?? []) as UpcomingJob[]) {
    const { data: result, error: releaseError } = await supabase.rpc(
      "release_assigned_helper",
      {
        p_request_id: job.request_id,
        p_reason: "helper_unavailable",
        p_expected_helper_id: helper.id,
      },
    );
    if (releaseError) {
      console.error("release_assigned_helper", releaseError);
      continue;
    }
    if ((result as { ok?: boolean } | null)?.ok) {
      released.push(job.request_id);
      await notifyUnavailable(
        supabase,
        job.request_id,
        helper,
        "Driving licence expired",
      );
    }
  }

  await supabase.rpc("withdraw_helper_open_offers", {
    p_helper_id: helper.id,
  });

  return released;
}

async function emailDlWarning(
  supabase: SupabaseClient,
  helper: HelperRow,
  kind: "30" | "7" | "expired",
) {
  const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
  if (!seniorEmail) {
    console.error("Missing SENIOR_EMAIL for DL warning");
    return false;
  }

  const expiry = helper.dl_expiry ?? "unknown";
  let expiry_phrase: string;
  let expired = false;
  if (kind === "expired") {
    expiry_phrase = "has expired";
    expired = true;
  } else if (kind === "7") {
    expiry_phrase = "expires in 7 days";
  } else {
    expiry_phrase = "expires in 30 days";
  }

  let upcoming_count = 0;
  if (expired) {
    const { data: jobs } = await supabase.rpc(
      "list_helper_upcoming_assigned_jobs",
      { p_helper_id: helper.id },
    );
    upcoming_count = Array.isArray(jobs) ? jobs.length : 0;
  }

  const email = templateM8({
    manager_first_name: MANAGER_FIRST_NAME,
    helper_full_name: helper.full_name,
    expiry_phrase,
    dl_expiry: String(expiry),
    upcoming_count,
    open_url: helperProfileUrl(helper.id),
    expired,
  });

  const result = await sendEmail({
    to: seniorEmail,
    toName: "Manager",
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  return result.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const payload = await req.json().catch(() => ({})) as {
      reason?: string;
    };

    const allowed = bearer === serviceRoleKey ||
      payload.reason === "cron" ||
      (anonKey && bearer === anonKey);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const today = todayIst();
    const in7 = addDaysIst(today, 7);
    const in30 = addDaysIst(today, 30);

    const { data: helpers, error } = await supabase
      .from("helpers")
      .select(
        "id, full_name, email, phone, dl_expiry, verification_status, dl_warn_30_sent_at, dl_warn_7_sent_at, dl_expired_notified_at",
      )
      .eq("can_drive", true)
      .not("dl_expiry", "is", null);
    if (error) throw error;

    const summary = {
      warned_30: 0,
      warned_7: 0,
      expired: 0,
      released_jobs: 0,
    };

    for (const helper of (helpers ?? []) as HelperRow[]) {
      const expiry = helper.dl_expiry;
      if (!expiry) continue;

      if (expiry === in30 && !helper.dl_warn_30_sent_at) {
        const sent = await emailDlWarning(supabase, helper, "30");
        if (sent) {
          await supabase
            .from("helpers")
            .update({ dl_warn_30_sent_at: new Date().toISOString() })
            .eq("id", helper.id);
          summary.warned_30 += 1;
        }
      }

      if (expiry === in7 && !helper.dl_warn_7_sent_at) {
        const sent = await emailDlWarning(supabase, helper, "7");
        if (sent) {
          await supabase
            .from("helpers")
            .update({ dl_warn_7_sent_at: new Date().toISOString() })
            .eq("id", helper.id);
          summary.warned_7 += 1;
        }
      }

      if (expiry <= today) {
        if (helper.verification_status === "verified") {
          await supabase
            .from("helpers")
            .update({ verification_status: "expired" })
            .eq("id", helper.id);
        }

        const released = await releaseUpcomingJobs(supabase, helper);
        summary.released_jobs += released.length;

        if (!helper.dl_expired_notified_at) {
          const sent = await emailDlWarning(supabase, helper, "expired");
          if (sent) {
            await supabase
              .from("helpers")
              .update({ dl_expired_notified_at: new Date().toISOString() })
              .eq("id", helper.id);
            summary.expired += 1;
          }
        } else if (helper.verification_status === "verified") {
          summary.expired += 1;
        }
      }
    }

    return jsonResponse({
      ok: true,
      reason: payload.reason ?? "manual",
      today_ist: today,
      ...summary,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
