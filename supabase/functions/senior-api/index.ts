import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  escapeHtml,
  formatAppointmentDate,
  formatAppointmentTime,
  sendEmail,
} from "../_shared/email.ts";
import { resolveSecret, timingSafeEqual } from "../_shared/secrets.ts";
import {
  approxDistanceLabel,
  preferenceLabel,
  reasonPlain,
  RESPOND_BASE,
} from "../_shared/senior.ts";

type ApiPayload = {
  key?: string;
  action?: string;
  request_id?: string;
  helper_id?: string;
};

type RequestRow = {
  id: string;
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
  senior_notified_at: string | null;
  guardian_arranging_sent_at: string | null;
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
  is_busy: boolean;
  busy_at: string | null;
  upcoming_assigned_jobs: number;
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

async function assertSeniorKey(
  supabase: SupabaseClient,
  provided: string,
): Promise<boolean> {
  const expected = await resolveSecret(supabase, "SENIOR_ACCESS_KEY");
  if (!expected) return false;
  return timingSafeEqual(provided, expected);
}

async function sendOfferEmail(
  request: RequestRow,
  helper: { full_name: string; email: string },
  token: string,
  distanceKm: number | null,
): Promise<boolean> {
  const dateLabel = formatAppointmentDate(request.appointment_date) ??
    request.appointment_date;
  const timeLabel = formatAppointmentTime(request.appointment_time) ??
    request.appointment_time;
  const area = [request.area, request.pincode].filter(Boolean).join(" · ") ||
    "Area on file";
  const subject = `New appointment near you – ${dateLabel}, ${timeLabel}`;
  const acceptUrl =
    `${RESPOND_BASE}?token=${encodeURIComponent(token)}&action=accept`;
  const declineUrl =
    `${RESPOND_BASE}?token=${encodeURIComponent(token)}&action=decline`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${escapeHtml(helper.full_name)},</p>
      <p>A new appointment is available near you.</p>
      <p>
        <strong>Date:</strong> ${escapeHtml(dateLabel)}<br />
        <strong>Time:</strong> ${escapeHtml(timeLabel)}<br />
        <strong>Area:</strong> ${escapeHtml(area)}<br />
        <strong>Approx. distance:</strong> ${escapeHtml(approxDistanceLabel(distanceKm))}<br />
        <strong>Doctor / Hospital:</strong> ${escapeHtml(request.doctor_hospital)}<br />
        <strong>Patient age:</strong> ${escapeHtml(String(request.parent_age))}<br />
        <strong>Helper preference:</strong> ${escapeHtml(preferenceLabel(request.helper_preference))}
      </p>
      <p><em>Full address and family contact will be shared after you accept.</em></p>
      <p style="margin: 24px 0;">
        <a href="${acceptUrl}" style="background:#1d6fd8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;margin-right:8px;">Accept</a>
        <a href="${declineUrl}" style="background:#e5e7eb;color:#111827;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Decline</a>
      </p>
      <p>Warm regards,<br />ABI Parent Care</p>
    </div>
  `;

  const result = await sendEmail({
    to: helper.email,
    toName: helper.full_name,
    subject,
    html,
  });
  return result.ok;
}

async function listNeedsSenior(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("consultation_requests")
    .select(
      "id, status, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, created_at",
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
      "id, status, parent_name, parent_age, address_line1, street, area, landmark, city, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, booking_person_name, relationship, email, phone_country_code, phone, created_at, assigned_helper_id, senior_notified_at, guardian_arranging_sent_at",
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

  const helpers = ((helpersRaw ?? []) as HelperCandidate[]).map((helper) => {
    const busyLabel = formatBusyAt(helper.busy_at);
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
      is_busy: helper.is_busy,
      busy_at: helper.busy_at,
      busy_label: busyLabel ? `Busy at ${busyLabel}` : null,
      upcoming_assigned_jobs: Number(helper.upcoming_assigned_jobs) || 0,
      warnings: buildWarnings(helper, req.helper_preference),
      selectable: !helper.is_busy,
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
    },
    helpers,
    offer_history: history,
  };
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
  if (!helper.selectable || helper.is_busy) {
    return {
      ok: false,
      code: "helper_busy",
      message: helper.busy_label || "Helper is busy at this time.",
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
    senior_notified_at: null,
    guardian_arranging_sent_at: null,
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
    const key = String(payload.key ?? "").trim();
    const action = String(payload.action ?? "list").trim().toLowerCase();

    if (!key) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const allowed = await assertSeniorKey(supabase, key);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

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
      const status = result.ok ? 200 : result.code === "helper_busy" ? 409 : 400;
      return jsonResponse(result, status);
    }

    return jsonResponse({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
