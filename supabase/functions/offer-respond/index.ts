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

type RespondPayload = {
  token?: string;
  action?: string;
};

type RequestDetails = {
  id: string;
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
  email: string;
  phone_country_code: string;
  phone: string;
  assigned_helper_id: string | null;
};

type HelperDetails = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function fullAddress(request: RequestDetails): string {
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

async function sendAcceptanceEmails(
  request: RequestDetails,
  helper: HelperDetails,
): Promise<{ helper: boolean; guardian: boolean }> {
  const dateLabel = formatAppointmentDate(request.appointment_date) ??
    request.appointment_date;
  const timeLabel = formatAppointmentTime(request.appointment_time) ??
    request.appointment_time;
  const address = fullAddress(request);
  const familyPhone =
    `${request.phone_country_code} ${request.phone}`.trim();

  const helperHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${escapeHtml(helper.full_name)},</p>
      <p>Your appointment is confirmed.</p>
      <p>
        <strong>Patient:</strong> ${escapeHtml(request.parent_name)} (age ${escapeHtml(String(request.parent_age))})<br />
        <strong>Address:</strong> ${escapeHtml(address)}<br />
        <strong>Date:</strong> ${escapeHtml(dateLabel)}<br />
        <strong>Time:</strong> ${escapeHtml(timeLabel)}<br />
        <strong>Doctor / Hospital:</strong> ${escapeHtml(request.doctor_hospital)}<br />
        <strong>Family contact:</strong> ${escapeHtml(request.booking_person_name)}
        (${escapeHtml(request.relationship)}) — ${escapeHtml(familyPhone)}
      </p>
      <p>Warm regards,<br />ABI Parent Care</p>
    </div>
  `;

  const guardianHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${escapeHtml(request.booking_person_name)},</p>
      <p>A helper has been assigned for your appointment.</p>
      <p>
        <strong>Helper:</strong> ${escapeHtml(helper.full_name)}<br />
        <strong>Helper phone:</strong> ${escapeHtml(helper.phone)}<br />
        <strong>Date:</strong> ${escapeHtml(dateLabel)}<br />
        <strong>Time:</strong> ${escapeHtml(timeLabel)}<br />
        <strong>Hospital:</strong> ${escapeHtml(request.doctor_hospital)}
      </p>
      <p>Warm regards,<br />ABI Parent Care</p>
    </div>
  `;

  const helperResult = await sendEmail({
    to: helper.email,
    toName: helper.full_name,
    subject: "Appointment confirmed",
    html: helperHtml,
  });

  const guardianResult = await sendEmail({
    to: request.email,
    toName: request.booking_person_name,
    subject: "A helper has been assigned",
    html: guardianHtml,
  });

  return { helper: helperResult.ok, guardian: guardianResult.ok };
}

async function triggerNextOffer(requestId: string, waveNumber?: number) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    await fetch(`${supabaseUrl}/functions/v1/offer-dispatcher`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        request_id: requestId,
        reason: "decline_backfill",
        offer_next: true,
        force: true,
        wave_number: waveNumber,
      }),
    });
  } catch (error) {
    console.error("Failed to trigger next offer after decline", error);
  }
}

async function notifySeniorOfDecline(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  helperName: string,
) {
  const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
  const accessKey = await resolveSecret(supabase, "SENIOR_ACCESS_KEY");
  if (!seniorEmail || !accessKey) {
    console.error("Missing SENIOR_EMAIL or SENIOR_ACCESS_KEY for decline alert");
    return;
  }

  const { data: request } = await supabase
    .from("consultation_requests")
    .select(
      "id, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return;

  const assignUrl = seniorAssignUrl(accessKey, requestId);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p><strong>${escapeHtml(helperName)}</strong> declined – please assign another helper.</p>
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
      })}
      <p style="margin: 24px 0;">${assignButtonHtml(assignUrl)}</p>
      <p>Warm regards,<br />ABI Parent Care</p>
    </div>
  `;

  await sendEmail({
    to: seniorEmail,
    toName: "Senior coordinator",
    subject: `${helperName} declined – please assign another`,
    html,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
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

    const payload = (await req.json()) as RespondPayload;
    const token = String(payload.token ?? "").trim();
    const action = String(payload.action ?? "").trim().toLowerCase();

    if (!token || (action !== "accept" && action !== "decline")) {
      return jsonResponse(
        { ok: false, message: "Missing token or action." },
        400,
      );
    }

    const tokenHash = await sha256Hex(token);
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (action === "accept") {
      const { data, error } = await supabase.rpc("accept_helper_offer", {
        p_token_hash: tokenHash,
      });
      if (error) {
        console.error("accept_helper_offer", error);
        return jsonResponse(
          { ok: false, message: "Could not process acceptance." },
          500,
        );
      }

      const result = data as {
        ok?: boolean;
        code?: string;
        message?: string;
        request_id?: string;
        helper_id?: string;
      };

      if (result?.ok && result.request_id && result.helper_id) {
        const [{ data: request }, { data: helper }] = await Promise.all([
          supabase
            .from("consultation_requests")
            .select(
              "id, parent_name, parent_age, address_line1, street, area, landmark, city, pincode, appointment_date, appointment_time, doctor_hospital, booking_person_name, relationship, email, phone_country_code, phone, assigned_helper_id",
            )
            .eq("id", result.request_id)
            .maybeSingle(),
          supabase
            .from("helpers")
            .select("id, full_name, email, phone")
            .eq("id", result.helper_id)
            .maybeSingle(),
        ]);

        if (request && helper) {
          await sendAcceptanceEmails(
            request as RequestDetails,
            helper as HelperDetails,
          );
        }
      }

      return jsonResponse({
        ok: Boolean(result?.ok),
        code: result?.code,
        message: result?.message ?? "Unable to process this offer.",
      });
    }

    const { data, error } = await supabase.rpc("decline_helper_offer", {
      p_token_hash: tokenHash,
    });
    if (error) {
      console.error("decline_helper_offer", error);
      return jsonResponse(
        { ok: false, message: "Could not process decline." },
        500,
      );
    }

    const result = data as {
      ok?: boolean;
      code?: string;
      message?: string;
      request_id?: string;
      wave_number?: number;
      request_status?: string;
      source?: string;
      helper_name?: string;
    };

    if (result?.ok && result.request_id && result.request_status === "offered") {
      await triggerNextOffer(result.request_id, result.wave_number);
    }

    if (
      result?.ok &&
      result.request_id &&
      result.source === "senior" &&
      result.request_status === "needs_senior"
    ) {
      await notifySeniorOfDecline(
        supabase,
        result.request_id,
        result.helper_name || "Helper",
      );
    }

    return jsonResponse({
      ok: Boolean(result?.ok),
      code: result?.code,
      message: result?.message ?? "Unable to process this offer.",
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, message }, 500);
  }
});
