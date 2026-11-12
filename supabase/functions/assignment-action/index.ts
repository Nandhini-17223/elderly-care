import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  guardianReplacementArrangingEmail,
  sha256Hex,
} from "../_shared/assignment.ts";
import { sendEmail } from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  MANAGER_FIRST_NAME,
  firstName,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import { ON_SCREEN } from "../_shared/templates-common.ts";
import { templateM5 } from "../_shared/templates-m.ts";

type ActionPayload = {
  token?: string;
  action?: string;
  reason?: string;
  preview?: boolean;
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
        "id, ref_number, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, booking_person_name, relationship, phone_country_code, phone, email, address_line1, street, landmark, city",
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
  const guardianPhone =
    `${request.phone_country_code ?? ""} ${request.phone ?? ""}`.trim();

  let seniorOk = false;
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
      guardian_phone: guardianPhone,
      dropout_reason: dropoutReason,
      assign_url: seniorAssignUrl(requestId),
    });
    const result = await sendEmail({
      to: seniorEmail,
      toName: "Senior coordinator",
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    seniorOk = result.ok;
  }

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

  const guardianResult = await sendEmail({
    to: request.email,
    toName: request.booking_person_name,
    subject: guardianEmail.subject,
    html: guardianEmail.html,
    text: guardianEmail.text,
  });

  return { senior: seniorOk, guardian: guardianResult.ok };
}

async function previewAssignment(
  supabase: ReturnType<typeof createClient>,
  tokenHash: string,
  action: string,
) {
  const { data: tokenRow } = await supabase
    .from("assignment_tokens")
    .select(
      "id, invalidated_at, helpers(full_name), consultation_requests(ref_number, status, appointment_date, appointment_time, area)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || tokenRow.invalidated_at) {
    return {
      ok: false,
      code: "invalid_token",
      title: ON_SCREEN.link_inactive.title,
      message: ON_SCREEN.link_inactive.message,
    };
  }

  if (action === "cant_make_it") {
    return {
      ok: true,
      code: "preview",
      title: ON_SCREEN.cant_make_it_confirm.title,
      message: ON_SCREEN.cant_make_it_confirm.message,
      button: ON_SCREEN.cant_make_it_confirm.button,
      helper_first_name: firstName(
        (tokenRow as { helpers?: { full_name?: string } | null }).helpers
          ?.full_name,
      ),
      ref_number:
        (tokenRow as {
          consultation_requests?: { ref_number?: string } | null;
        }).consultation_requests?.ref_number,
    };
  }

  return {
    ok: true,
    code: "preview",
    title: "Confirm you'll be there",
    message: "Tap Confirm to let us know you'll attend.",
    button: "Confirm",
    helper_first_name: firstName(
      (tokenRow as { helpers?: { full_name?: string } | null }).helpers
        ?.full_name,
    ),
  };
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

    if (payload.preview) {
      return jsonResponse(await previewAssignment(supabase, tokenHash, action));
    }

    if (action === "confirm_attendance") {
      const { data, error } = await supabase.rpc("confirm_helper_attendance", {
        p_token_hash: tokenHash,
      });
      if (error) {
        console.error("confirm_helper_attendance", error);
        return jsonResponse(
          {
            ok: false,
            title: ON_SCREEN.link_inactive.title,
            message: "Could not confirm attendance.",
          },
          500,
        );
      }
      const result = data as {
        ok?: boolean;
        code?: string;
        message?: string;
      };
      if (!result?.ok) {
        return jsonResponse({
          ok: false,
          code: result?.code,
          title: ON_SCREEN.link_inactive.title,
          message: ON_SCREEN.link_inactive.message,
        });
      }
      return jsonResponse({
        ok: true,
        code: result?.code,
        title: ON_SCREEN.confirmed.title,
        message: ON_SCREEN.confirmed.message,
      });
    }

    const { data, error } = await supabase.rpc("helper_cant_make_it", {
      p_token_hash: tokenHash,
      p_reason: reason || null,
    });
    if (error) {
      console.error("helper_cant_make_it", error);
      return jsonResponse(
        {
          ok: false,
          title: ON_SCREEN.link_inactive.title,
          message: "Could not process this response.",
        },
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

    if (!result?.ok) {
      return jsonResponse({
        ok: false,
        code: result?.code,
        title: ON_SCREEN.link_inactive.title,
        message: ON_SCREEN.link_inactive.message,
      });
    }

    return jsonResponse({
      ok: true,
      code: result?.code,
      title: ON_SCREEN.cant_make_it_done.title,
      message: ON_SCREEN.cant_make_it_done.message,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, message }, 500);
  }
});
