import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  appointmentConfirmedEmailHtml,
  createRawToken,
  guardianHelperAssignedEmailHtml,
  guardianNewHelperEmailHtml,
  type RequestContact,
} from "../_shared/assignment.ts";
import {
  escapeHtml,
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

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendAcceptanceEmails(
  supabase: ReturnType<typeof createClient>,
  request: RequestContact & { id: string; email: string },
  helper: HelperDetails,
  isReplacement: boolean,
): Promise<{ helper: boolean; guardian: boolean; token_ok: boolean }> {
  const { token, hash } = await createRawToken();
  const { data: tokenResult, error: tokenError } = await supabase.rpc(
    "create_assignment_token",
    {
      p_request_id: request.id,
      p_helper_id: helper.id,
      p_token_hash: hash,
    },
  );
  if (tokenError) {
    console.error("create_assignment_token", tokenError);
  }
  const tokenOk = Boolean((tokenResult as { ok?: boolean } | null)?.ok);

  const helperHtml = appointmentConfirmedEmailHtml(
    request,
    helper.full_name,
    token,
  );
  const guardianHtml = isReplacement
    ? guardianNewHelperEmailHtml(request, helper)
    : guardianHelperAssignedEmailHtml(request, helper);
  const guardianSubject = isReplacement
    ? `Your new helper is ${helper.full_name}`
    : "A helper has been assigned";

  const helperResult = await sendEmail({
    to: helper.email,
    toName: helper.full_name,
    subject: "Appointment confirmed",
    html: helperHtml,
  });

  const guardianResult = await sendEmail({
    to: request.email,
    toName: request.booking_person_name,
    subject: guardianSubject,
    html: guardianHtml,
  });

  return {
    helper: helperResult.ok,
    guardian: guardianResult.ok,
    token_ok: tokenOk,
  };
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

async function triggerReminders(requestId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/helper-reminders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        request_id: requestId,
        reason: "post_accept",
      }),
    });
  } catch (error) {
    console.error("Failed to trigger helper-reminders after accept", error);
  }
}

async function notifySeniorOfDecline(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  helperName: string,
) {
  const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
  if (!seniorEmail) {
    console.error("Missing SENIOR_EMAIL for decline alert");
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

  const assignUrl = seniorAssignUrl(requestId);
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
        is_replacement?: boolean;
      };

      if (result?.ok && result.request_id && result.helper_id) {
        const [{ data: request }, { data: helper }] = await Promise.all([
          supabase
            .from("consultation_requests")
            .select(
              "id, parent_name, parent_age, address_line1, street, area, landmark, city, pincode, appointment_date, appointment_time, doctor_hospital, booking_person_name, relationship, email, phone_country_code, phone",
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
            supabase,
            request as RequestContact & { id: string; email: string },
            helper as HelperDetails,
            Boolean(result.is_replacement),
          );
          // Send any reminders that are already due for this assignment
          await triggerReminders(result.request_id);
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
