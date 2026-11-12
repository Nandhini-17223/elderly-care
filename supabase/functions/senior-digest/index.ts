import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  MANAGER_FIRST_NAME,
  needsActionUrl,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import { templateM2 } from "../_shared/templates.ts";

type RequestRow = {
  id: string;
  ref_number?: string | null;
  parent_name: string;
  parent_age: number;
  area: string | null;
  pincode: string | null;
  appointment_date: string;
  appointment_time: string;
  helper_preference: string;
  needs_senior_reason: string | null;
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

function appointmentSortKey(row: RequestRow): number {
  const date = String(row.appointment_date);
  const time = String(row.appointment_time).slice(0, 8);
  return Date.parse(`${date}T${time}+05:30`);
}

function digestTimeLabel(now = new Date()): string {
  // Asia/Kolkata wall clock like "1:00 PM"
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "AM")
    .toUpperCase();
  return `${hour}:${minute} ${dayPeriod}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from("consultation_requests")
      .select(
        "id, ref_number, parent_name, parent_age, area, pincode, appointment_date, appointment_time, helper_preference, needs_senior_reason",
      )
      .eq("status", "needs_senior");

    if (error) throw error;

    const rows = ((data ?? []) as RequestRow[]).sort(
      (a, b) => appointmentSortKey(a) - appointmentSortKey(b),
    );

    if (rows.length === 0) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "none",
        count: 0,
      });
    }

    const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
    if (!seniorEmail) {
      return jsonResponse({ error: "SENIOR_EMAIL missing" }, 500);
    }

    const email = templateM2({
      manager_first_name: MANAGER_FIRST_NAME,
      digest_time: digestTimeLabel(),
      open_all_url: needsActionUrl(),
      items: rows.map((row) => ({
        ref: String(row.ref_number ?? "–"),
        parent_name: row.parent_name,
        parent_age: row.parent_age,
        appointment_date: row.appointment_date,
        appointment_time: row.appointment_time,
        area: row.area,
        pincode: row.pincode,
        helper_preference: row.helper_preference,
        reason: row.needs_senior_reason,
        assign_url: seniorAssignUrl(row.id),
      })),
    });

    const result = await sendEmail({
      to: seniorEmail,
      toName: "Senior coordinator",
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    return jsonResponse({
      ok: result.ok,
      count: rows.length,
      request_ids: rows.map((r) => r.id),
      email_id: result.id,
      subject: result.subject,
      error: result.error,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
