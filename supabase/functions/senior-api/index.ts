import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  guardianReplacementArrangingEmail,
} from "../_shared/assignment.ts";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  sendEmail,
} from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  MANAGER_FIRST_NAME,
  RESPOND_BASE,
  approxDistanceLabel,
  firstName,
  preferenceLabel,
  reasonPlain,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import { templateH1 } from "../_shared/templates-h.ts";
import { templateM5 } from "../_shared/templates-m.ts";
import { requireStaff, writeAudit } from "../_shared/staff-auth.ts";

type ApiPayload = {
  action?: string;
  request_id?: string;
  helper_id?: string;
};

type RequestRow = {
  id: string;
  ref_number?: string | null;
  status: string;
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
  helper_preference: string;
  needs_senior_reason: string | null;
  booking_person_name: string;
  relationship: string;
  email: string;
  phone_country_code: string;
  phone: string;
  created_at: string;
  assigned_helper_id: string | null;
  assigned_at: string | null;
  senior_notified_at: string | null;
  guardian_arranging_sent_at: string | null;
  helper_confirmed_at: string | null;
  confirmed_by: string | null;
  helper_dropped_at: string | null;
  previous_helper_ids: string[] | null;
};

type HelperCandidate = {
  helper_id: string;
  full_name: string;
  gender: string;
  home_area: string | null;
  home_pincode: string | null;
  email: string;
  phone: string;
  max_travel_km: number;
  distance_km: number | null;
  within_range: boolean;
  gender_match: boolean;
  declined_before: boolean;
  dropped_before: boolean;
  is_busy: boolean;
  busy_at: string | null;
  upcoming_assigned_jobs: number;
  verification_status?: string;
  is_verified?: boolean;
};

type OfferHistoryRow = {
  id: string;
  helper_id: string;
  status: string;
  source: string;
  wave_number: number;
  sent_at: string;
  responded_at: string | null;
  distance_km: number | null;
  helpers: { full_name: string; gender: string } | null;
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

async function createOfferToken(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToHex(bytes);
  const hash = await sha256Hex(token);
  return { token, hash };
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

function formatBusyAt(busyAt: string | null): string | null {
  if (!busyAt) return null;
  return formatAppointmentTime(String(busyAt).slice(0, 8)) ??
    String(busyAt).slice(0, 5);
}

function buildWarnings(
  helper: HelperCandidate,
  preference: string,
): string[] {
  const warnings: string[] = [];
  if (helper.dropped_before) {
    warnings.push("⚠ Dropped out of this request");
  }
  if (!helper.gender_match) {
    const asked = preference === "female"
      ? "Female"
      : preference === "male"
      ? "Male"
      : "Any";
    const actual = helper.gender === "female" ? "Female" : "Male";
    warnings.push(`⚠ ${actual} – family asked for ${asked}`);
  }
  if (
    helper.distance_km != null &&
    !helper.within_range &&
    helper.max_travel_km != null
  ) {
    const dist = Math.round(Number(helper.distance_km) * 10) / 10;
    const limit = Math.round(Number(helper.max_travel_km) * 10) / 10;
    warnings.push(`⚠ ${dist} km away (limit ${limit} km)`);
  }
  if (helper.declined_before) {
    warnings.push("⚠ Already declined this request");
  }
  return warnings;
}

async function sendOfferEmail(
  request: RequestRow,
  helper: { full_name: string; email: string },
  token: string,
  distanceKm: number | null,
): Promise<boolean> {
  const acceptUrl =
    `${RESPOND_BASE}?token=${encodeURIComponent(token)}&action=accept`;
  const declineUrl =
    `${RESPOND_BASE}?token=${encodeURIComponent(token)}&action=decline`;

  const email = templateH1({
    ref: String(request.ref_number ?? "–"),
    helper_first_name: firstName(helper.full_name),
    appointment_date: request.appointment_date,
    appointment_time: request.appointment_time,
    area: request.area,
    pincode: request.pincode,
    distance_km: distanceKm,
    doctor_hospital: request.doctor_hospital,
    parent_age: request.parent_age,
    accept_url: acceptUrl,
    decline_url: declineUrl,
  });

  const result = await sendEmail({
    to: helper.email,
    toName: helper.full_name,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  return result.ok;
}

async function listNeedsSenior(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("consultation_requests")
    .select(
      "id, ref_number, status, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, created_at",
    )
    .eq("status", "needs_senior")
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    reason_label: reasonPlain(row.needs_senior_reason),
    preference_label: preferenceLabel(row.helper_preference),
    appointment_date_label: formatAppointmentDate(row.appointment_date),
    appointment_time_label: formatAppointmentTime(row.appointment_time),
  }));
}

async function getRequestDetail(
  supabase: SupabaseClient,
  requestId: string,
) {
  const { data: request, error } = await supabase
    .from("consultation_requests")
    .select(
      "id, ref_number, status, parent_name, parent_age, address_line1, street, area, landmark, city, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, booking_person_name, relationship, email, phone_country_code, phone, created_at, assigned_helper_id, assigned_at, senior_notified_at, guardian_arranging_sent_at, helper_confirmed_at, confirmed_by, helper_dropped_at, previous_helper_ids",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  if (!request) return null;

  const req = request as RequestRow;

  const [{ data: helpersRaw, error: helpersError }, { data: offers, error: offersError }] =
    await Promise.all([
      supabase.rpc("list_helpers_for_senior", { p_request_id: requestId }),
      supabase
        .from("helper_offers")
        .select(
          "id, helper_id, status, source, wave_number, sent_at, responded_at, distance_km, helpers(full_name, gender)",
        )
        .eq("request_id", requestId)
        .order("sent_at", { ascending: true }),
    ]);

  if (helpersError) throw helpersError;
  if (offersError) throw offersError;

  let assignedHelper: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
  } | null = null;
  if (req.assigned_helper_id) {
    const { data: helperRow } = await supabase
      .from("helpers")
      .select("id, full_name, phone, email")
      .eq("id", req.assigned_helper_id)
      .maybeSingle();
    if (helperRow) assignedHelper = helperRow;
  }

  const helpers = ((helpersRaw ?? []) as HelperCandidate[]).map((helper) => {
    const busyLabel = formatBusyAt(helper.busy_at);
    const dropped = Boolean(helper.dropped_before);
    const verified = helper.is_verified !== false &&
      (helper.verification_status == null ||
        helper.verification_status === "verified");
    return {
      id: helper.helper_id,
      full_name: helper.full_name,
      gender: helper.gender,
      home_area: helper.home_area,
      home_pincode: helper.home_pincode,
      distance_km: helper.distance_km,
      distance_label: approxDistanceLabel(helper.distance_km),
      max_travel_km: helper.max_travel_km,
      within_range: helper.within_range,
      gender_match: helper.gender_match,
      declined_before: helper.declined_before,
      dropped_before: dropped,
      is_busy: helper.is_busy,
      busy_at: helper.busy_at,
      busy_label: busyLabel ? `Busy at ${busyLabel}` : null,
      upcoming_assigned_jobs: Number(helper.upcoming_assigned_jobs) || 0,
      verification_status: helper.verification_status ?? null,
      is_verified: verified,
      warnings: buildWarnings(helper, req.helper_preference),
      selectable: verified && !helper.is_busy && !dropped,
    };
  });

  const history = ((offers ?? []) as OfferHistoryRow[]).map((offer) => ({
    id: offer.id,
    helper_id: offer.helper_id,
    helper_name: offer.helpers?.full_name ?? "Helper",
    helper_gender: offer.helpers?.gender ?? null,
    status: offer.status,
    source: offer.source,
    wave_number: offer.wave_number,
    sent_at: offer.sent_at,
    responded_at: offer.responded_at,
    distance_km: offer.distance_km,
  }));

  return {
    request: {
      id: req.id,
      status: req.status,
      parent_name: req.parent_name,
      parent_age: req.parent_age,
      address: fullAddress(req),
      area: req.area,
      pincode: req.pincode,
      city: req.city,
      appointment_date: req.appointment_date,
      appointment_time: req.appointment_time,
      appointment_date_label: formatAppointmentDate(req.appointment_date),
      appointment_time_label: formatAppointmentTime(req.appointment_time),
      doctor_hospital: req.doctor_hospital,
      helper_preference: req.helper_preference,
      preference_label: preferenceLabel(req.helper_preference),
      needs_senior_reason: req.needs_senior_reason,
      reason_label: reasonPlain(req.needs_senior_reason),
      booking_person_name: req.booking_person_name,
      relationship: req.relationship,
      phone: `${req.phone_country_code} ${req.phone}`.trim(),
      created_at: req.created_at,
      assigned_helper_id: req.assigned_helper_id,
      assigned_at: req.assigned_at,
      helper_confirmed_at: req.helper_confirmed_at,
      confirmed_by: req.confirmed_by,
      helper_dropped_at: req.helper_dropped_at,
      previous_helper_ids: req.previous_helper_ids ?? [],
      assigned_helper: assignedHelper,
    },
    helpers,
    offer_history: history,
  };
}

async function notifyDropoutEmails(
  supabase: SupabaseClient,
  requestId: string,
  helperId: string,
  reasonLabel: string,
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
  if (!request || !helper) return;

  const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");

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

async function sendSeniorOffer(
  supabase: SupabaseClient,
  requestId: string,
  helperId: string,
) {
  const detail = await getRequestDetail(supabase, requestId);
  if (!detail) {
    return { ok: false, code: "request_not_found", message: "Request not found." };
  }

  const request = detail.request;
  if (request.status !== "needs_senior" && request.status !== "senior_offered") {
    return {
      ok: false,
      code: "invalid_status",
      message: "Request is not awaiting senior assignment.",
    };
  }

  const helper = detail.helpers.find((h) => h.id === helperId);
  if (!helper) {
    return { ok: false, code: "helper_not_found", message: "Helper not found." };
  }
  if (!helper.selectable) {
    const code = !helper.is_verified
      ? "helper_not_verified"
      : helper.dropped_before
      ? "helper_dropped_before"
      : "helper_busy";
    return {
      ok: false,
      code,
      message: !helper.is_verified
        ? "Not verified"
        : helper.dropped_before
        ? "This helper previously dropped out of this request."
        : helper.busy_label || "Helper is busy at this time.",
    };
  }

  const { data: helperRow, error: helperError } = await supabase
    .from("helpers")
    .select("id, full_name, email")
    .eq("id", helperId)
    .maybeSingle();
  if (helperError) throw helperError;
  if (!helperRow) {
    return { ok: false, code: "helper_not_found", message: "Helper not found." };
  }

  const { token, hash } = await createOfferToken();
  const { data: created, error: createError } = await supabase.rpc(
    "create_senior_offer",
    {
      p_request_id: requestId,
      p_helper_id: helperId,
      p_token_hash: hash,
      p_distance_km: helper.distance_km,
    },
  );
  if (createError) throw createError;

  const result = created as {
    ok?: boolean;
    code?: string;
    message?: string;
    offer_id?: string;
    expiry_minutes?: number;
    urgent?: boolean;
  };

  if (!result?.ok) {
    return {
      ok: false,
      code: result?.code ?? "offer_failed",
      message: result?.message ?? "Could not create senior offer.",
    };
  }

  const requestForEmail = {
    id: request.id,
    status: "senior_offered",
    parent_name: request.parent_name,
    parent_age: request.parent_age,
    address_line1: null,
    street: null,
    area: request.area,
    landmark: null,
    city: request.city,
    pincode: request.pincode,
    appointment_date: request.appointment_date,
    appointment_time: request.appointment_time,
    doctor_hospital: request.doctor_hospital,
    helper_preference: request.helper_preference,
    needs_senior_reason: request.needs_senior_reason,
    booking_person_name: request.booking_person_name,
    relationship: request.relationship,
    email: "",
    phone_country_code: "",
    phone: "",
    created_at: request.created_at,
    assigned_helper_id: null,
    assigned_at: null,
    senior_notified_at: null,
    guardian_arranging_sent_at: null,
    helper_confirmed_at: null,
    confirmed_by: null,
    helper_dropped_at: null,
    previous_helper_ids: request.previous_helper_ids,
  } as RequestRow;

  const emailed = await sendOfferEmail(
    requestForEmail,
    helperRow,
    token,
    helper.distance_km,
  );

  return {
    ok: true,
    code: "offered",
    message: `Offer sent to ${helperRow.full_name}.`,
    offer_id: result.offer_id,
    emailed,
    helper_id: helperId,
    request_id: requestId,
    expiry_minutes: result.expiry_minutes ?? 60,
    urgent: Boolean(result.urgent),
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

    const payload = (await req.json().catch(() => ({}))) as ApiPayload;
    const action = String(payload.action ?? "list").trim().toLowerCase();

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const staffOrError = await requireStaff(req, supabase);
    if ("error" in staffOrError) {
      // SENIOR_ACCESS_KEY is no longer accepted — JWT + staff role required.
      return staffOrError.error;
    }
    const staff = staffOrError;

    if (action === "list") {
      const requests = await listNeedsSenior(supabase);
      return jsonResponse({ ok: true, action: "list", requests });
    }

    if (action === "detail") {
      const requestId = String(payload.request_id ?? "").trim();
      if (!requestId) {
        return jsonResponse({ ok: false, error: "request_id required" }, 400);
      }
      const detail = await getRequestDetail(supabase, requestId);
      if (!detail) {
        return jsonResponse({ ok: false, error: "Request not found" }, 404);
      }
      return jsonResponse({ ok: true, action: "detail", ...detail });
    }

    if (action === "send_offer") {
      const requestId = String(payload.request_id ?? "").trim();
      const helperId = String(payload.helper_id ?? "").trim();
      if (!requestId || !helperId) {
        return jsonResponse(
          { ok: false, error: "request_id and helper_id required" },
          400,
        );
      }
      const result = await sendSeniorOffer(supabase, requestId, helperId);
      if (result.ok) {
        await writeAudit(supabase, staff, "send_offer", "consultation_request", requestId, {
          helper_id: helperId,
          offer_id: result.offer_id,
        });
      }
      const status = result.ok
        ? 200
        : result.code === "helper_busy" || result.code === "helper_dropped_before"
        ? 409
        : 400;
      return jsonResponse(result, status);
    }

    if (action === "confirm_by_phone") {
      const requestId = String(payload.request_id ?? "").trim();
      if (!requestId) {
        return jsonResponse({ ok: false, error: "request_id required" }, 400);
      }
      const { data, error } = await supabase.rpc("senior_confirm_helper", {
        p_request_id: requestId,
      });
      if (error) throw error;
      const result = data as {
        ok?: boolean;
        code?: string;
        message?: string;
      };
      if (result?.ok) {
        await writeAudit(
          supabase,
          staff,
          "confirm_by_phone",
          "consultation_request",
          requestId,
          {},
        );
      }
      return jsonResponse({
        ok: Boolean(result?.ok),
        code: result?.code,
        message: result?.message ?? "Unable to confirm.",
      });
    }

    if (action === "helper_unable_reassign") {
      const requestId = String(payload.request_id ?? "").trim();
      if (!requestId) {
        return jsonResponse({ ok: false, error: "request_id required" }, 400);
      }

      const { data: before } = await supabase
        .from("consultation_requests")
        .select("assigned_helper_id")
        .eq("id", requestId)
        .maybeSingle();
      const helperId = before?.assigned_helper_id as string | null;
      if (!helperId) {
        return jsonResponse({
          ok: false,
          code: "not_assigned",
          message: "Request is not currently assigned.",
        }, 400);
      }

      const { data, error } = await supabase.rpc("release_assigned_helper", {
        p_request_id: requestId,
        p_reason: "helper_not_confirmed",
        p_expected_helper_id: helperId,
      });
      if (error) throw error;
      const result = data as {
        ok?: boolean;
        code?: string;
        message?: string;
        helper_id?: string;
      };

      if (result?.ok && result.helper_id) {
        await notifyDropoutEmails(
          supabase,
          requestId,
          result.helper_id,
          "helper_not_confirmed",
        );
        await writeAudit(
          supabase,
          staff,
          "helper_unable_reassign",
          "consultation_request",
          requestId,
          { helper_id: result.helper_id },
        );
      }

      return jsonResponse({
        ok: Boolean(result?.ok),
        code: result?.code,
        message: result?.ok
          ? "Helper released. Select a replacement below."
          : result?.message ?? "Unable to release helper.",
        request_id: requestId,
      });
    }

    return jsonResponse({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
