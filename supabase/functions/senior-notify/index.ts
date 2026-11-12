import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { formatRemaining } from "../_shared/assignment.ts";
import { appointmentMsIst, sendEmail } from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  MANAGER_FIRST_NAME,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import { templateG2 } from "../_shared/templates-g.ts";
import { templateM1 } from "../_shared/templates-m.ts";

type NotifyPayload = {
  request_id?: string;
  reason?: string;
};

type RequestRow = {
  id: string;
  ref_number?: string | null;
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
  relationship?: string | null;
  phone_country_code?: string | null;
  phone?: string | null;
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

function familyPhone(request: RequestRow): string {
  return `${request.phone_country_code ?? ""} ${request.phone ?? ""}`.trim();
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
        "id, ref_number, status, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, booking_person_name, relationship, phone_country_code, phone, email, senior_notified_at, guardian_arranging_sent_at, address_line1, street, landmark, city",
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

    const results: Record<string, unknown> = {
      request_id: request.id,
      guardian: null,
      senior_urgent: null,
    };

    // 1) Guardian reassurance — once (G2)
    if (!request.guardian_arranging_sent_at) {
      const guardianEmail = templateG2({
        ref: String(request.ref_number ?? "–"),
        booking_person_name: request.booking_person_name,
        parent_name: request.parent_name,
        appointment_date: request.appointment_date,
        appointment_time: request.appointment_time,
      });
      const guardianResult = await sendEmail({
        to: request.email,
        toName: request.booking_person_name,
        subject: guardianEmail.subject,
        html: guardianEmail.html,
        text: guardianEmail.text,
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

    // 2) Immediate senior alert for short_notice (M1)
    if (
      request.needs_senior_reason === "short_notice" &&
      !request.senior_notified_at
    ) {
      const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
      if (!seniorEmail) {
        results.senior_urgent = { ok: false, error: "SENIOR_EMAIL missing" };
      } else {
        const apptMs = appointmentMsIst(
          request.appointment_date,
          request.appointment_time,
        );
        const remaining = Number.isFinite(apptMs)
          ? formatRemaining(apptMs - Date.now())
          : "soon";
        const seniorEmailContent = templateM1({
          ref: String(request.ref_number ?? "–"),
          manager_first_name: MANAGER_FIRST_NAME,
          parent_name: request.parent_name,
          parent_age: request.parent_age,
          appointment_date: request.appointment_date,
          appointment_time: request.appointment_time,
          area: request.area,
          city: request.city,
          pincode: request.pincode,
          doctor_hospital: request.doctor_hospital,
          helper_preference: request.helper_preference,
          booking_person_name: request.booking_person_name,
          relationship: String(request.relationship ?? ""),
          guardian_phone: familyPhone(request),
          time_remaining: remaining,
          assign_url: seniorAssignUrl(request.id),
        });
        const seniorResult = await sendEmail({
          to: seniorEmail,
          toName: "Senior coordinator",
          subject: seniorEmailContent.subject,
          html: seniorEmailContent.html,
          text: seniorEmailContent.text,
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
