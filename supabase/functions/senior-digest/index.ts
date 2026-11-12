import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  escapeHtml,
  formatAppointmentDate,
  formatAppointmentTime,
  sendEmail,
} from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  assignButtonHtml,
  firstName,
  preferenceLabel,
  reasonPlain,
  seniorAssignUrl,
} from "../_shared/senior.ts";

type RequestRow = {
  id: string;
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
        "id, parent_name, parent_age, area, pincode, appointment_date, appointment_time, helper_preference, needs_senior_reason",
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

    const itemsHtml = rows.map((row) => {
      const dateLabel = formatAppointmentDate(row.appointment_date) ??
        row.appointment_date;
      const timeLabel = formatAppointmentTime(row.appointment_time) ??
        row.appointment_time;
      const area = [row.area, row.pincode].filter(Boolean).join(" · ") ||
        "Area on file";
      const assignUrl = seniorAssignUrl(row.id);
      return `
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:0 0 14px;">
          <p style="margin:0 0 8px;">
            <strong>${escapeHtml(firstName(row.parent_name))}</strong>, age ${escapeHtml(String(row.parent_age))}<br />
            <strong>Date:</strong> ${escapeHtml(dateLabel)} &nbsp; <strong>Time:</strong> ${escapeHtml(timeLabel)}<br />
            <strong>Area:</strong> ${escapeHtml(area)}<br />
            <strong>Helper preference:</strong> ${escapeHtml(preferenceLabel(row.helper_preference))}<br />
            <strong>Reason:</strong> ${escapeHtml(reasonPlain(row.needs_senior_reason))}
          </p>
          <p style="margin:12px 0 0;">${assignButtonHtml(assignUrl)}</p>
        </div>
      `;
    }).join("");

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <p>Senior digest — ${rows.length} request${rows.length === 1 ? "" : "s"} needing a helper (oldest appointment first).</p>
        ${itemsHtml}
        <p>Warm regards,<br />ABI Parent Care</p>
      </div>
    `;

    const result = await sendEmail({
      to: seniorEmail,
      toName: "Senior coordinator",
      subject: `Senior digest: ${rows.length} need${rows.length === 1 ? "s" : ""} a helper`,
      html,
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
