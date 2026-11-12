import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  appointmentConfirmedEmail,
  createRawToken,
  guardianHelperAssignedEmail,
  guardianNewHelperEmail,
  type RequestContact,
} from "../_shared/assignment.ts";
import {
  formatAppointmentDateShort,
  formatAppointmentTime,
  sendEmail,
} from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  MANAGER_FIRST_NAME,
  firstName,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import {
  ON_SCREEN,
  fillOnScreen,
  templateM3,
} from "../_shared/templates.ts";

type RespondPayload = {
  token?: string;
  action?: string;
  preview?: boolean;
};

type HelperDetails = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  photo_path?: string | null;
  photo_status?: string | null;
  photo_url?: string | null;
};

async function helperPhotoSignedUrl(
  supabase: ReturnType<typeof createClient>,
  helper: HelperDetails,
  appointmentDate: string,
): Promise<string | null> {
  if (helper.photo_status !== "approved" || !helper.photo_path) return null;
  const dayAfter = new Date(`${appointmentDate}T23:59:59+05:30`);
  if (Number.isNaN(dayAfter.getTime())) return null;
  dayAfter.setDate(dayAfter.getDate() + 1);
  const expiresIn = Math.max(
    60,
    Math.floor((dayAfter.getTime() - Date.now()) / 1000),
  );
  const { data, error } = await supabase.storage
    .from("helper-photos")
    .createSignedUrl(helper.photo_path, expiresIn);
  if (error) {
    console.error("helper photo signed url", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

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

async function loadPreviousHelperFirstName(
  supabase: ReturnType<typeof createClient>,
  previousHelperIds: string[] | null | undefined,
): Promise<string> {
  const ids = previousHelperIds ?? [];
  if (!ids.length) return "the previous helper";
  const lastId = ids[ids.length - 1];
  const { data } = await supabase
    .from("helpers")
    .select("full_name")
    .eq("id", lastId)
    .maybeSingle();
  return firstName(data?.full_name) || "the previous helper";
}

async function sendAcceptanceEmails(
  supabase: ReturnType<typeof createClient>,
  request: RequestContact & {
    id: string;
    email: string;
    ref_number?: string | null;
    previous_helper_ids?: string[] | null;
  },
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

  const photoUrl = await helperPhotoSignedUrl(
    supabase,
    helper,
    request.appointment_date,
  );
  const helperForGuardian = { ...helper, photo_url: photoUrl };

  const helperEmail = appointmentConfirmedEmail(
    request,
    helper.full_name,
    token,
  );
  const oldHelperFirst = isReplacement
    ? await loadPreviousHelperFirstName(supabase, request.previous_helper_ids)
    : "";
  const guardianEmail = isReplacement
    ? guardianNewHelperEmail(request, helperForGuardian, oldHelperFirst)
    : guardianHelperAssignedEmail(request, helperForGuardian);

  const helperResult = await sendEmail({
    to: helper.email,
    toName: helper.full_name,
    subject: helperEmail.subject,
    html: helperEmail.html,
    text: helperEmail.text,
  });

  const guardianResult = await sendEmail({
    to: request.email,
    toName: request.booking_person_name,
    subject: guardianEmail.subject,
    html: guardianEmail.html,
    text: guardianEmail.text,
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
      "id, ref_number, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return;

  const email = templateM3({
    ref: String(request.ref_number ?? "–"),
    manager_first_name: MANAGER_FIRST_NAME,
    helper_full_name: helperName,
    parent_name: request.parent_name,
    appointment_date: request.appointment_date,
    appointment_time: request.appointment_time,
    area: request.area,
    decline_reason: null,
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

async function previewOffer(
  supabase: ReturnType<typeof createClient>,
  tokenHash: string,
) {
  const { data: offer } = await supabase
    .from("helper_offers")
    .select(
      "id, status, helper_id, request_id, helpers(full_name), consultation_requests(ref_number, appointment_date, appointment_time, area, pincode, parent_name, status)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!offer) {
    return {
      ok: false,
      code: "invalid_token",
      title: ON_SCREEN.link_inactive.title,
      message: ON_SCREEN.link_inactive.message,
    };
  }

  const request = (offer as {
    consultation_requests?: {
      ref_number?: string;
      appointment_date?: string;
      appointment_time?: string;
      area?: string | null;
      pincode?: string | null;
      status?: string;
    } | null;
    helpers?: { full_name?: string } | null;
    status?: string;
  }).consultation_requests;

  if (!request || offer.status !== "sent" || request.status === "assigned") {
    return {
      ok: false,
      code: "token_invalid",
      title: ON_SCREEN.link_inactive.title,
      message: ON_SCREEN.link_inactive.message,
    };
  }

  const vars = {
    appointment_date_short: formatAppointmentDateShort(
      request.appointment_date,
    ),
    appointment_time: formatAppointmentTime(request.appointment_time) ??
      String(request.appointment_time ?? ""),
    area: String(request.area ?? request.pincode ?? "–"),
    helper_first_name: firstName(
      (offer as { helpers?: { full_name?: string } | null }).helpers
        ?.full_name,
    ),
    ref: String(request.ref_number ?? "–"),
  };

  return {
    ok: true,
    code: "preview",
    ref_number: request.ref_number,
    title: ON_SCREEN.accept_confirm.title,
    message: fillOnScreen(ON_SCREEN.accept_confirm.message, vars),
    button: ON_SCREEN.accept_confirm.button,
    helper_first_name: vars.helper_first_name,
  };
}

function mapAcceptScreen(
  code: string | undefined,
  helperFirstName: string,
): { title: string; message: string } {
  if (code === "accepted") {
    return {
      title: ON_SCREEN.accepted.title,
      message: fillOnScreen(ON_SCREEN.accepted.message, {
        helper_first_name: helperFirstName,
      }),
    };
  }
  if (code === "already_taken") {
    return {
      title: ON_SCREEN.already_taken.title,
      message: ON_SCREEN.already_taken.message,
    };
  }
  if (code === "helper_engaged") {
    return {
      title: ON_SCREEN.helper_engaged.title,
      message: ON_SCREEN.helper_engaged.message,
    };
  }
  return {
    title: ON_SCREEN.link_inactive.title,
    message: ON_SCREEN.link_inactive.message,
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

    if (payload.preview) {
      if (action === "accept") {
        return jsonResponse(await previewOffer(supabase, tokenHash));
      }
      return jsonResponse({
        ok: true,
        code: "preview",
        title: "Thanks for letting us know",
        message: "Tap Confirm to decline this visit.",
        button: "Confirm",
      });
    }

    if (action === "accept") {
      const { data, error } = await supabase.rpc("accept_helper_offer", {
        p_token_hash: tokenHash,
      });
      if (error) {
        console.error("accept_helper_offer", error);
        return jsonResponse(
          {
            ok: false,
            title: ON_SCREEN.link_inactive.title,
            message: "Could not process acceptance.",
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
        is_replacement?: boolean;
      };

      let helperFirstName = "there";
      if (result?.ok && result.request_id && result.helper_id) {
        const [{ data: request }, { data: helper }] = await Promise.all([
          supabase
            .from("consultation_requests")
            .select(
              "id, ref_number, parent_name, parent_age, address_line1, street, area, landmark, city, pincode, appointment_date, appointment_time, doctor_hospital, booking_person_name, relationship, email, phone_country_code, phone, previous_helper_ids",
            )
            .eq("id", result.request_id)
            .maybeSingle(),
          supabase
            .from("helpers")
            .select("id, full_name, email, phone, photo_path, photo_status")
            .eq("id", result.helper_id)
            .maybeSingle(),
        ]);

        if (request && helper) {
          helperFirstName = firstName(helper.full_name);
          await sendAcceptanceEmails(
            supabase,
            request as RequestContact & {
              id: string;
              email: string;
              ref_number?: string | null;
              previous_helper_ids?: string[] | null;
            },
            helper as HelperDetails,
            Boolean(result.is_replacement),
          );
          await triggerReminders(result.request_id);
        }
      }

      const screen = mapAcceptScreen(result?.code, helperFirstName);
      return jsonResponse({
        ok: Boolean(result?.ok),
        code: result?.code,
        title: screen.title,
        message: screen.message,
      });
    }

    const { data, error } = await supabase.rpc("decline_helper_offer", {
      p_token_hash: tokenHash,
    });
    if (error) {
      console.error("decline_helper_offer", error);
      return jsonResponse(
        {
          ok: false,
          title: ON_SCREEN.link_inactive.title,
          message: "Could not process decline.",
        },
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
      title: ON_SCREEN.declined.title,
      message: ON_SCREEN.declined.message,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, message }, 500);
  }
});
