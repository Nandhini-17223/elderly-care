import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  MANAGER_FIRST_NAME,
  RESPOND_BASE,
  firstName,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import { loadAppSettings, settingInt } from "../_shared/staff-auth.ts";
import { templateH1 } from "../_shared/templates-h.ts";
import { templateM4 } from "../_shared/templates-m.ts";

type DispatcherPayload = {
  request_id?: string;
  reason?: string;
  force?: boolean;
  offer_next?: boolean;
  limit?: number;
  wave_number?: number;
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
  offer_window_ends_at: string | null;
  location_missing: boolean;
};

type SuitableHelper = {
  helper_id: string;
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  distance_km: number;
  upcoming_assigned_jobs: number;
};

type OfferInsert = {
  request_id: string;
  helper_id: string;
  wave_number: number;
  status: "sent";
  token_hash: string;
  distance_km: number | null;
  raw_token: string;
  helper: SuitableHelper;
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

async function sendOfferEmail(
  request: RequestRow,
  helper: SuitableHelper,
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

async function markNeedsSenior(
  supabase: SupabaseClient,
  requestId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_request_needs_senior", {
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) {
    console.error("mark_request_needs_senior failed", requestId, error);
  }
}

async function notifySeniorOfExpiry(
  supabase: SupabaseClient,
  requestId: string,
  helperName: string,
  expiryMinutes = 60,
  helperPhone: string | null = null,
) {
  const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
  if (!seniorEmail) {
    console.error("Missing SENIOR_EMAIL for expiry alert");
    return;
  }

  const request = await loadRequest(supabase, requestId);
  if (!request) return;

  const assignUrl = seniorAssignUrl(requestId);
  const windowLabel = expiryMinutes === 15 ? "15 minutes" : "1 hour";

  const email = templateM4({
    ref: String(request.ref_number ?? "–"),
    manager_first_name: MANAGER_FIRST_NAME,
    helper_full_name: helperName,
    helper_phone: helperPhone,
    parent_name: request.parent_name,
    appointment_date: request.appointment_date,
    appointment_time: request.appointment_time,
    area: request.area,
    expiry_window: windowLabel,
    assign_url: assignUrl,
  });

  await sendEmail({
    to: seniorEmail,
    toName: "Senior coordinator",
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

async function expireStaleSeniorOffers(
  supabase: SupabaseClient,
  settings: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  // Fetch open senior offers; urgent window + expiry come from app_settings.
  const engagedHours = settingInt(settings, "engaged_window_hours", 3);
  const urgentExpiry = settingInt(settings, "urgent_offer_expiry_minutes", 15);
  const normalExpiry = settingInt(settings, "senior_offer_expiry_minutes", 60);

  const { data, error } = await supabase
    .from("helper_offers")
    .select(
      "id, request_id, helper_id, sent_at, helpers(full_name, phone), consultation_requests(appointment_date, appointment_time)",
    )
    .eq("source", "senior")
    .eq("status", "sent");

  if (error) {
    console.error("expireStaleSeniorOffers query", error);
    return [{ error: error.message }];
  }

  const results: Record<string, unknown>[] = [];
  const now = Date.now();

  for (const row of data ?? []) {
    const req = (row as {
      consultation_requests?: {
        appointment_date?: string;
        appointment_time?: string;
      } | null;
    }).consultation_requests;
    const sentAt = Date.parse(row.sent_at);
    if (!Number.isFinite(sentAt) || !req?.appointment_date || !req?.appointment_time) {
      continue;
    }
    const apptMs = Date.parse(
      `${req.appointment_date}T${String(req.appointment_time).slice(0, 8)}+05:30`,
    );
    if (!Number.isFinite(apptMs)) continue;

    const hoursToApptAtSend = (apptMs - sentAt) / 3600000;
    const expiryMinutes = hoursToApptAtSend < engagedHours
      ? urgentExpiry
      : normalExpiry;
    if (now - sentAt < expiryMinutes * 60 * 1000) {
      continue;
    }

    const { data: expired, error: expireError } = await supabase.rpc(
      "expire_senior_offer",
      { p_offer_id: row.id },
    );
    if (expireError) {
      results.push({ offer_id: row.id, ok: false, error: expireError.message });
      continue;
    }
    const payload = expired as {
      ok?: boolean;
      request_id?: string;
      helper_name?: string;
    };
    if (payload?.ok && payload.request_id) {
      const helperMeta = (row as {
        helpers?: { full_name?: string; phone?: string } | null;
      }).helpers;
      const helperName =
        payload.helper_name || helperMeta?.full_name || "Helper";
      await notifySeniorOfExpiry(
        supabase,
        payload.request_id,
        helperName,
        expiryMinutes,
        helperMeta?.phone ?? null,
      );
    }
    results.push({
      offer_id: row.id,
      request_id: row.request_id,
      expired: Boolean(payload?.ok),
      helper_name: payload?.helper_name,
      expiry_minutes: expiryMinutes,
    });
  }
  return results;
}

async function loadRequest(
  supabase: SupabaseClient,
  requestId: string,
): Promise<RequestRow | null> {
  const { data, error } = await supabase
    .from("consultation_requests")
    .select(
      "id, ref_number, status, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, offer_window_ends_at, location_missing",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    console.error("loadRequest", error);
    return null;
  }
  return data as RequestRow | null;
}

async function getOfferStats(
  supabase: SupabaseClient,
  requestId: string,
): Promise<{
  maxWave: number;
  lastSentAt: string | null;
  sentCount: number;
  declinedCount: number;
  totalOffers: number;
}> {
  const { data, error } = await supabase
    .from("helper_offers")
    .select("wave_number, status, sent_at")
    .eq("request_id", requestId);
  if (error) {
    console.error("getOfferStats", error);
    return {
      maxWave: 0,
      lastSentAt: null,
      sentCount: 0,
      declinedCount: 0,
      totalOffers: 0,
    };
  }
  const rows = data ?? [];
  let maxWave = 0;
  let lastSentAt: string | null = null;
  let sentCount = 0;
  let declinedCount = 0;
  for (const row of rows) {
    maxWave = Math.max(maxWave, Number(row.wave_number) || 0);
    if (!lastSentAt || String(row.sent_at) > lastSentAt) {
      lastSentAt = String(row.sent_at);
    }
    if (row.status === "sent") sentCount += 1;
    if (row.status === "declined") declinedCount += 1;
  }
  return {
    maxWave,
    lastSentAt,
    sentCount,
    declinedCount,
    totalOffers: rows.length,
  };
}

async function findSuitableHelpers(
  supabase: SupabaseClient,
  requestId: string,
  limit: number,
): Promise<SuitableHelper[]> {
  const { data, error } = await supabase.rpc("find_suitable_helpers", {
    p_request_id: requestId,
    p_limit: limit,
  });
  if (error) {
    console.error("find_suitable_helpers", error);
    return [];
  }
  return (data ?? []) as SuitableHelper[];
}

async function createAndSendOffers(
  supabase: SupabaseClient,
  request: RequestRow,
  helpers: SuitableHelper[],
  waveNumber: number,
): Promise<{ created: number; emailed: number }> {
  if (helpers.length === 0) {
    return { created: 0, emailed: 0 };
  }

  const prepared: OfferInsert[] = [];
  for (const helper of helpers) {
    const { token, hash } = await createOfferToken();
    prepared.push({
      request_id: request.id,
      helper_id: helper.helper_id,
      wave_number: waveNumber,
      status: "sent",
      token_hash: hash,
      distance_km: helper.distance_km ?? null,
      raw_token: token,
      helper,
    });
  }

  const { error } = await supabase.from("helper_offers").insert(
    prepared.map((row) => ({
      request_id: row.request_id,
      helper_id: row.helper_id,
      wave_number: row.wave_number,
      status: row.status,
      token_hash: row.token_hash,
      distance_km: row.distance_km,
    })),
  );

  if (error) {
    console.error("insert helper_offers", error);
    return { created: 0, emailed: 0 };
  }

  let emailed = 0;
  for (const row of prepared) {
    const ok = await sendOfferEmail(
      request,
      row.helper,
      row.raw_token,
      row.distance_km,
    );
    if (ok) emailed += 1;
  }

  return { created: prepared.length, emailed };
}

function minutesBetween(isoA: string, isoB: string): number {
  return (Date.parse(isoB) - Date.parse(isoA)) / 60000;
}

async function processRequest(
  supabase: SupabaseClient,
  request: RequestRow,
  options: {
    force?: boolean;
    offerNext?: boolean;
    limit?: number;
    waveNumber?: number;
  },
  settings: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  if (request.status !== "offered") {
    return { request_id: request.id, skipped: true, reason: "not_offered" };
  }

  const waveGap = settingInt(settings, "wave_gap_minutes", 15);
  const waveSize = settingInt(settings, "wave_size", 10);

  const now = new Date();
  if (
    request.offer_window_ends_at &&
    Date.parse(request.offer_window_ends_at) <= now.getTime()
  ) {
    const stats = await getOfferStats(supabase, request.id);
    const reason = stats.totalOffers > 0 &&
        stats.declinedCount === stats.totalOffers &&
        stats.sentCount === 0
      ? "all_declined"
      : "no_acceptance";
    await markNeedsSenior(supabase, request.id, reason);
    return { request_id: request.id, expired: true, reason };
  }

  // Night pause (unless forced for tests / immediate decline backfill)
  if (!options.force && !options.offerNext) {
    const { data: active, error } = await supabase.rpc(
      "is_within_active_hours",
      { p_ts: now.toISOString() },
    );
    if (error) {
      console.error("is_within_active_hours", error);
      return {
        request_id: request.id,
        skipped: true,
        reason: "active_hours_check_failed",
      };
    }
    if (active === false) {
      return { request_id: request.id, skipped: true, reason: "night_pause" };
    }
  }

  const stats = await getOfferStats(supabase, request.id);
  const offerNext = Boolean(options.offerNext);
  const force = Boolean(options.force);

  if (!offerNext && !force && stats.maxWave > 0 && stats.lastSentAt) {
    const elapsed = minutesBetween(stats.lastSentAt, now.toISOString());
    if (elapsed < waveGap) {
      return {
        request_id: request.id,
        skipped: true,
        reason: "wave_interval",
        elapsed_minutes: elapsed,
      };
    }
  }

  const limit = offerNext ? 1 : (options.limit ?? waveSize);
  const helpers = await findSuitableHelpers(supabase, request.id, limit);

  if (helpers.length === 0) {
    if (stats.totalOffers === 0) {
      await markNeedsSenior(supabase, request.id, "no_suitable_helpers");
      return {
        request_id: request.id,
        needs_senior: true,
        reason: "no_suitable_helpers",
      };
    }

    if (stats.sentCount === 0) {
      const reason = stats.declinedCount === stats.totalOffers
        ? "all_declined"
        : "no_suitable_helpers";
      await markNeedsSenior(supabase, request.id, reason);
      return { request_id: request.id, needs_senior: true, reason };
    }

    return {
      request_id: request.id,
      skipped: true,
      reason: "waiting_on_open_offers",
      open_offers: stats.sentCount,
    };
  }

  const waveNumber = options.waveNumber ??
    (offerNext ? Math.max(stats.maxWave, 1) : stats.maxWave + 1);
  const sendResult = await createAndSendOffers(
    supabase,
    request,
    helpers,
    waveNumber,
  );

  return {
    request_id: request.id,
    wave_number: waveNumber,
    offered: sendResult.created,
    emailed: sendResult.emailed,
    helper_ids: helpers.map((h) => h.helper_id),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
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

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let payload: DispatcherPayload = {};
    try {
      payload = (await req.json()) as DispatcherPayload;
    } catch {
      payload = {};
    }

    const settings = await loadAppSettings(supabase);
    const results: Record<string, unknown>[] = [];
    const seniorExpiry = await expireStaleSeniorOffers(supabase, settings);

    if (payload.request_id) {
      const request = await loadRequest(supabase, payload.request_id);
      if (!request) {
        return jsonResponse({ error: "Request not found" }, 404);
      }
      results.push(
        await processRequest(supabase, request, {
          force: payload.force,
          offerNext: payload.offer_next,
          limit: payload.limit,
          waveNumber: payload.wave_number,
        }, settings),
      );
    } else {
      // Expire windows first
      const { data: offeredRows, error } = await supabase
        .from("consultation_requests")
        .select(
          "id, ref_number, status, parent_name, parent_age, area, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, offer_window_ends_at, location_missing",
        )
        .eq("status", "offered");

      if (error) {
        throw error;
      }

      for (const row of (offeredRows ?? []) as RequestRow[]) {
        results.push(
          await processRequest(supabase, row, {
            force: payload.force,
          }, settings),
        );
      }
    }

    return jsonResponse({
      ok: true,
      reason: payload.reason ?? "manual",
      results,
      senior_expiry: seniorExpiry,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
