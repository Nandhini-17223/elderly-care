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
  formatRequestSummaryHtml,
  seniorAssignUrl,
} from "../_shared/senior.ts";

type NotifyPayload = {
  request_id?: string;
  reason?: string;
};

type RequestRow = {
  id: string;
  status: string;
  parent_name: string;
  parent_age: number;
  area: string | null;
  pincode: string | null;
  appointment_date: string;
  appointment_time: string;
  doctor_hospital: string;
  helper_preference: string;
  needs_senior_reason: string | null;
  booking_person_name: string;
  email: string;
  senior_notified_at: string | null;
  guardian_arranging_sent_at: string | null;
  address_line1: string | null;
  street: string | null;
  landmark: string | null;
  city: string;
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

function fullAddress(request: RequestRow): string {
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

    const payload = (await req.json().catch(() => ({}))) as NotifyPayload;
    const requestId = String(payload.request_id ?? "").trim();
    if (!requestId) {
      return jsonResponse({ error: "request_id required" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from("consultation_requests")
      .select(
        "id, status, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, booking_person_name, email, senior_notified_at, guardian_arranging_sent_at, address_line1, street, landmark, city",
      )
      .eq("id", requestId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonResponse({ error: "Request not found" }, 404);

    const request = data as RequestRow;
    if (request.status !== "needs_senior") {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "not_needs_senior",
        status: request.status,
      });
    }

    const dateLabel = formatAppointmentDate(request.appointment_date) ??
      request.appointment_date;
    const timeLabel = formatAppointmentTime(request.appointment_time) ??
      request.appointment_time;

    const results: Record<string, unknown> = {
      request_id: request.id,
      guardian: null,
      senior_urgent: null,
    };

    // 1) Guardian reassurance — once
    if (!request.guardian_arranging_sent_at) {
      const guardianHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <p>Hi ${escapeHtml(request.booking_person_name)},</p>
          <p>We’re arranging a suitable helper for ${escapeHtml(request.parent_name)}’s appointment on ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}. We’ll confirm the helper’s details shortly.</p>
          <p>Warm regards,<br />ABI Parent Care</p>
        </div>
      `;
      const guardianResult = await sendEmail({
        to: request.email,
        toName: request.booking_person_name,
        subject: `We’re arranging a helper for ${request.parent_name}`,
        html: guardianHtml,
      });

      if (guardianResult.ok) {
        await supabase
          .from("consultation_requests")
          .update({ guardian_arranging_sent_at: new Date().toISOString() })
          .eq("id", request.id)
          .is("guardian_arranging_sent_at", null);
      }
      results.guardian = {
        ok: guardianResult.ok,
        id: guardianResult.id,
        subject: guardianResult.subject,
      };
    } else {
      results.guardian = { skipped: true, reason: "already_sent" };
    }

    // 2) Immediate senior alert for short_notice
    if (
      request.needs_senior_reason === "short_notice" &&
      !request.senior_notified_at
    ) {
      const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
      if (!seniorEmail) {
        results.senior_urgent = { ok: false, error: "SENIOR_EMAIL missing" };
      } else {
        const assignUrl = seniorAssignUrl(request.id);
        const seniorHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
            <p><strong>URGENT:</strong> A consultation request needs a helper on short notice.</p>
            ${formatRequestSummaryHtml({
              parentName: request.parent_name,
              parentAge: request.parent_age,
              appointmentDate: request.appointment_date,
              appointmentTime: request.appointment_time,
              area: request.area,
              pincode: request.pincode,
              doctorHospital: request.doctor_hospital,
              helperPreference: request.helper_preference,
              reason: request.needs_senior_reason,
              address: fullAddress(request),
            })}
            <p style="margin: 24px 0;">${assignButtonHtml(assignUrl)}</p>
            <p>Warm regards,<br />ABI Parent Care</p>
          </div>
        `;
        const seniorResult = await sendEmail({
          to: seniorEmail,
          toName: "Senior coordinator",
          subject: `URGENT: helper needed – ${dateLabel} ${timeLabel}`,
          html: seniorHtml,
        });

        if (seniorResult.ok) {
          await supabase
            .from("consultation_requests")
            .update({ senior_notified_at: new Date().toISOString() })
            .eq("id", request.id)
            .is("senior_notified_at", null);
        }
        results.senior_urgent = {
          ok: seniorResult.ok,
          id: seniorResult.id,
          subject: seniorResult.subject,
        };
      }
    } else {
      results.senior_urgent = {
        skipped: true,
        reason: request.needs_senior_reason === "short_notice"
          ? "already_notified"
          : "not_short_notice",
      };
    }

    return jsonResponse({ ok: true, ...results });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
