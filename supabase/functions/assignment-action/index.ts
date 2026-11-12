import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  appointmentLabels,
  formatRemaining,
  guardianReplacementArrangingHtml,
  sha256Hex,
} from "../_shared/assignment.ts";
import { escapeHtml, sendEmail } from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  assignButtonHtml,
  firstName,
  formatRequestSummaryHtml,
  seniorAssignUrl,
} from "../_shared/senior.ts";

type ActionPayload = {
  token?: string;
  action?: string;
  reason?: string;
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

async function notifyDropoutEmails(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  helperId: string,
  dropoutReason: string | null,
) {
  const [{ data: request }, { data: helper }] = await Promise.all([
    supabase
      .from("consultation_requests")
      .select(
        "id, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, booking_person_name, email, address_line1, street, landmark, city",
      )
      .eq("id", requestId)
      .maybeSingle(),
    supabase
      .from("helpers")
      .select("id, full_name, phone")
      .eq("id", helperId)
      .maybeSingle(),
  ]);

  if (!request || !helper) return { senior: false, guardian: false };

  const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
  const accessKey = await resolveSecret(supabase, "SENIOR_ACCESS_KEY");
  const { dateLabel, timeLabel } = appointmentLabels(request);
  const patientFirst = firstName(request.parent_name);

  let seniorOk = false;
  if (seniorEmail && accessKey) {
    const apptMs = Date.parse(
      // Approximate IST wall clock as UTC+5:30 for remaining time display
      `${request.appointment_date}T${
        String(request.appointment_time).slice(0, 8)
      }+05:30`,
    );
    const remaining = Number.isFinite(apptMs)
      ? formatRemaining(apptMs - Date.now())
      : "soon";
    const assignUrl = seniorAssignUrl(accessKey, requestId);
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <p><strong>URGENT:</strong> ${escapeHtml(helper.full_name)} can’t attend – ${escapeHtml(patientFirst)}, ${escapeHtml(dateLabel)} ${escapeHtml(timeLabel)}</p>
        ${
      dropoutReason
        ? `<p><strong>Reason:</strong> ${escapeHtml(dropoutReason)}</p>`
        : ""
    }
        <p><strong>Time remaining:</strong> ${escapeHtml(remaining)}</p>
        ${
      formatRequestSummaryHtml({
        parentName: request.parent_name,
        parentAge: request.parent_age,
        appointmentDate: request.appointment_date,
        appointmentTime: request.appointment_time,
        area: request.area,
        pincode: request.pincode,
        doctorHospital: request.doctor_hospital,
        helperPreference: request.helper_preference,
        reason: request.needs_senior_reason,
      })
    }
        <p style="margin: 24px 0;">${assignButtonHtml(assignUrl)}</p>
        <p>Warm regards,<br />ABI Parent Care</p>
      </div>
    `;
    const result = await sendEmail({
      to: seniorEmail,
      toName: "Senior coordinator",
      subject:
        `URGENT: ${helper.full_name} can’t attend – ${patientFirst}, ${dateLabel} ${timeLabel}`,
      html,
    });
    seniorOk = result.ok;
  }

  const guardianHtml = guardianReplacementArrangingHtml(
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
      relationship: "",
      phone_country_code: "",
      phone: "",
      email: request.email,
    },
    helper.full_name,
  );

  const guardianResult = await sendEmail({
    to: request.email,
    toName: request.booking_person_name,
    subject: `${firstName(helper.full_name)} is unable to attend – arranging replacement`,
    html: guardianHtml,
  });

  return { senior: seniorOk, guardian: guardianResult.ok };
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

    const payload = (await req.json().catch(() => ({}))) as ActionPayload;
    const token = String(payload.token ?? "").trim();
    const action = String(payload.action ?? "").trim().toLowerCase();
    const reason = String(payload.reason ?? "").trim();

    if (
      !token ||
      (action !== "confirm_attendance" && action !== "cant_make_it")
    ) {
      return jsonResponse(
        { ok: false, message: "Missing token or action." },
        400,
      );
    }

    const tokenHash = await sha256Hex(token);
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (action === "confirm_attendance") {
      const { data, error } = await supabase.rpc("confirm_helper_attendance", {
        p_token_hash: tokenHash,
      });
      if (error) {
        console.error("confirm_helper_attendance", error);
        return jsonResponse(
          { ok: false, message: "Could not confirm attendance." },
          500,
        );
      }
      const result = data as {
        ok?: boolean;
        code?: string;
        message?: string;
      };
      return jsonResponse({
        ok: Boolean(result?.ok),
        code: result?.code,
        message: result?.message ?? "Unable to confirm.",
      });
    }

    const { data, error } = await supabase.rpc("helper_cant_make_it", {
      p_token_hash: tokenHash,
      p_reason: reason || null,
    });
    if (error) {
      console.error("helper_cant_make_it", error);
      return jsonResponse(
        { ok: false, message: "Could not process this response." },
        500,
      );
    }

    const result = data as {
      ok?: boolean;
      code?: string;
      message?: string;
      request_id?: string;
      helper_id?: string;
      dropout_reason?: string | null;
    };

    if (result?.ok && result.request_id && result.helper_id) {
      await notifyDropoutEmails(
        supabase,
        result.request_id,
        result.helper_id,
        result.dropout_reason ?? (reason || null),
      );
    }

    return jsonResponse({
      ok: Boolean(result?.ok),
      code: result?.code,
      message: result?.message ??
        "Thanks for letting us know. We’ll arrange a replacement.",
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, message }, 500);
  }
});
