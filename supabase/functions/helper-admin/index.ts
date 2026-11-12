import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  appointmentLabels,
  formatRemaining,
  guardianReplacementArrangingHtml,
} from "../_shared/assignment.ts";
import { escapeHtml, sendEmail } from "../_shared/email.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import {
  assignButtonHtml,
  firstName,
  formatRequestSummaryHtml,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import {
  requireStaff,
  writeAudit,
  type StaffContext,
} from "../_shared/staff-auth.ts";

type Payload = {
  action?: string;
  helper_id?: string;
  search?: string;
  verification_status?: string;
  is_active?: boolean | string;
  gender?: string;
  area?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  home_area?: string;
  home_pincode?: string;
  max_travel_km?: number | string;
  languages?: string | null;
  can_drive?: boolean;
  notes?: string | null;
  aadhaar_qr_verified?: boolean;
  aadhaar_last4?: string;
  aadhaar?: string;
  second_id_type?: string;
  second_id_last4?: string;
  dl_last4?: string;
  dl_expiry?: string;
  bg_check_method?: string;
  bg_check_reference?: string | null;
  bg_check_notes?: string | null;
  bg_check_date?: string;
  references_checked?: boolean;
  references_notes?: string | null;
  content_type?: string;
  file_ext?: string;
  path?: string;
  decision?: string;
  rejection_reason?: string;
  confirm?: boolean;
  password?: string;
};

type HelperRow = Record<string, unknown> & {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  can_drive: boolean;
  verification_status: string;
  aadhaar_qr_verified: boolean;
  aadhaar_last4: string | null;
  second_id_type: string | null;
  second_id_last4: string | null;
  dl_last4: string | null;
  dl_expiry: string | null;
  bg_check_method: string | null;
  bg_check_date: string | null;
  photo_path: string | null;
  photo_status: string;
  is_active: boolean;
};

type UpcomingJob = {
  request_id: string;
  parent_name: string;
  appointment_date: string;
  appointment_time: string;
  doctor_hospital: string;
  area: string | null;
  status: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HELPER_SELECT = [
  "id",
  "full_name",
  "gender",
  "email",
  "phone",
  "city",
  "languages",
  "is_active",
  "notes",
  "home_area",
  "home_pincode",
  "max_travel_km",
  "latitude",
  "longitude",
  "location_missing",
  "can_drive",
  "verification_status",
  "aadhaar_qr_verified",
  "aadhaar_last4",
  "aadhaar_verified_at",
  "aadhaar_verified_by",
  "second_id_type",
  "second_id_last4",
  "dl_last4",
  "dl_expiry",
  "bg_check_method",
  "bg_check_reference",
  "bg_check_notes",
  "bg_check_date",
  "photo_path",
  "photo_status",
  "references_checked",
  "references_notes",
  "verified_at",
  "verified_by",
  "rejection_reason",
  "dl_warn_30_sent_at",
  "dl_warn_7_sent_at",
  "dl_expired_notified_at",
  "created_at",
  "updated_at",
].join(", ");

const SECOND_ID_TYPES = new Set([
  "pan",
  "voter_id",
  "passport",
  "driving_licence",
]);

const BG_METHODS = new Set([
  "police_certificate",
  "vendor",
  "in_house",
]);

const PHOTO_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);

/** Tiny 1×1 transparent PNG for TEST helper placeholders. */
const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

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

function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isLast4(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

function looksLikeFullAadhaar(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 || value.trim().length > 4;
}

function parseBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function appointmentIsFuture(date: string, time: string): boolean {
  const ms = Date.parse(
    `${date}T${String(time).slice(0, 8)}+05:30`,
  );
  return Number.isFinite(ms) && ms >= Date.now();
}

export function verificationProgress(helper: {
  aadhaar_qr_verified?: boolean | null;
  aadhaar_last4?: string | null;
  second_id_type?: string | null;
  second_id_last4?: string | null;
  can_drive?: boolean | null;
  dl_expiry?: string | null;
  bg_check_method?: string | null;
  bg_check_date?: string | null;
  photo_status?: string | null;
}): {
  done: number;
  total: 4;
  items: {
    aadhaar: boolean;
    second_id: boolean;
    bg_check: boolean;
    photo: boolean;
  };
} {
  const today = todayIst();
  const aadhaar = Boolean(helper.aadhaar_qr_verified) &&
    isLast4(helper.aadhaar_last4);
  let secondId = Boolean(helper.second_id_type) && isLast4(helper.second_id_last4);
  if (helper.can_drive) {
    secondId = secondId &&
      helper.second_id_type === "driving_licence" &&
      typeof helper.dl_expiry === "string" &&
      helper.dl_expiry > today;
  }
  const bgCheck = Boolean(helper.bg_check_method) &&
    Boolean(helper.bg_check_date);
  const photo = helper.photo_status === "approved";
  const items = {
    aadhaar,
    second_id: secondId,
    bg_check: bgCheck,
    photo,
  };
  const done = Object.values(items).filter(Boolean).length;
  return { done, total: 4, items };
}

async function loadHelper(
  admin: SupabaseClient,
  helperId: string,
): Promise<HelperRow | null> {
  const { data, error } = await admin
    .from("helpers")
    .select(HELPER_SELECT)
    .eq("id", helperId)
    .maybeSingle();
  if (error) throw error;
  return (data as HelperRow | null) ?? null;
}

async function listUpcomingJobs(
  admin: SupabaseClient,
  helperId: string,
): Promise<UpcomingJob[]> {
  const { data, error } = await admin.rpc(
    "list_helper_upcoming_assigned_jobs",
    { p_helper_id: helperId },
  );
  if (error) throw error;
  return (data ?? []) as UpcomingJob[];
}

async function upcomingJobCounts(
  admin: SupabaseClient,
  helperIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of helperIds) counts.set(id, 0);
  if (!helperIds.length) return counts;

  const { data, error } = await admin
    .from("consultation_requests")
    .select("id, assigned_helper_id, appointment_date, appointment_time, status")
    .eq("status", "assigned")
    .in("assigned_helper_id", helperIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const helperId = row.assigned_helper_id as string | null;
    if (!helperId) continue;
    if (
      appointmentIsFuture(
        String(row.appointment_date),
        String(row.appointment_time),
      )
    ) {
      counts.set(helperId, (counts.get(helperId) ?? 0) + 1);
    }
  }
  return counts;
}

async function notifyUnavailableEmails(
  supabase: SupabaseClient,
  requestId: string,
  helperId: string,
  reasonLabel: string,
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
  if (!request || !helper) return;

  const seniorEmail = await resolveSecret(supabase, "SENIOR_EMAIL");
  const { dateLabel, timeLabel } = appointmentLabels(request);
  const patientFirst = firstName(request.parent_name);

  if (seniorEmail) {
    const apptMs = Date.parse(
      `${request.appointment_date}T${
        String(request.appointment_time).slice(0, 8)
      }+05:30`,
    );
    const remaining = Number.isFinite(apptMs)
      ? formatRemaining(apptMs - Date.now())
      : "soon";
    const assignUrl = seniorAssignUrl(requestId);
    await sendEmail({
      to: seniorEmail,
      toName: "Senior coordinator",
      subject:
        `URGENT: ${helper.full_name} can’t attend – ${patientFirst}, ${dateLabel} ${timeLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <p><strong>URGENT:</strong> ${escapeHtml(helper.full_name)} can’t attend – ${escapeHtml(patientFirst)}, ${escapeHtml(dateLabel)} ${escapeHtml(timeLabel)}</p>
          <p><strong>Reason:</strong> ${escapeHtml(reasonLabel)}</p>
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
      `,
    });
  }

  await sendEmail({
    to: request.email,
    toName: request.booking_person_name,
    subject: `${firstName(helper.full_name)} is unable to attend – arranging replacement`,
    html: guardianReplacementArrangingHtml(
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
      },
      helper.full_name,
    ),
  });
}

async function releaseHelperJobs(
  admin: SupabaseClient,
  helperId: string,
  jobs: UpcomingJob[],
  reasonLabel: string,
): Promise<{ request_id: string; helper_id: string }[]> {
  const released: { request_id: string; helper_id: string }[] = [];
  for (const job of jobs) {
    const { data, error } = await admin.rpc("release_assigned_helper", {
      p_request_id: job.request_id,
      p_reason: "helper_unavailable",
      p_expected_helper_id: helperId,
    });
    if (error) {
      console.error("release_assigned_helper", error);
      continue;
    }
    const result = data as { ok?: boolean; request_id?: string; helper_id?: string };
    if (result?.ok) {
      released.push({
        request_id: result.request_id ?? job.request_id,
        helper_id: result.helper_id ?? helperId,
      });
      try {
        await notifyUnavailableEmails(
          admin,
          job.request_id,
          helperId,
          reasonLabel,
        );
      } catch (emailError) {
        console.error("notifyUnavailableEmails", emailError);
      }
    }
  }
  await admin.rpc("withdraw_helper_open_offers", { p_helper_id: helperId });
  return released;
}

async function resolveCityFromPincode(
  admin: SupabaseClient,
  pincode: string,
): Promise<string> {
  const { data, error } = await admin
    .from("pincodes")
    .select("district")
    .eq("pincode", pincode)
    .maybeSingle();
  if (error) {
    console.error("pincode lookup", error);
  }
  const district = data?.district ? String(data.district).trim() : "";
  return district || "Chennai";
}

function pickProfileFields(payload: Payload): {
  fields: Record<string, unknown>;
  error?: string;
} {
  const fields: Record<string, unknown> = {};

  if (payload.full_name !== undefined) {
    const fullName = String(payload.full_name ?? "").trim();
    if (!fullName) return { fields, error: "full_name required" };
    fields.full_name = fullName;
  }
  if (payload.gender !== undefined) {
    const gender = String(payload.gender ?? "").trim().toLowerCase();
    if (gender !== "female" && gender !== "male") {
      return { fields, error: "gender must be female or male" };
    }
    fields.gender = gender;
  }
  if (payload.email !== undefined) {
    const email = String(payload.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return { fields, error: "valid email required" };
    }
    fields.email = email;
  }
  if (payload.phone !== undefined) {
    const phone = String(payload.phone ?? "").trim();
    if (!phone) return { fields, error: "phone required" };
    fields.phone = phone;
  }
  if (payload.home_area !== undefined) {
    fields.home_area = String(payload.home_area ?? "").trim() || null;
  }
  if (payload.home_pincode !== undefined) {
    const pin = String(payload.home_pincode ?? "").trim();
    if (!/^\d{6}$/.test(pin)) {
      return { fields, error: "home_pincode must be 6 digits" };
    }
    fields.home_pincode = pin;
  }
  if (payload.max_travel_km !== undefined) {
    const km = Number(payload.max_travel_km);
    if (!Number.isFinite(km) || km <= 0 || km > 200) {
      return { fields, error: "max_travel_km must be between 1 and 200" };
    }
    fields.max_travel_km = Math.round(km);
  }
  if (payload.languages !== undefined) {
    fields.languages = payload.languages == null
      ? null
      : String(payload.languages).trim() || null;
  }
  if (payload.can_drive !== undefined) {
    const canDrive = parseBool(payload.can_drive);
    if (canDrive === undefined) {
      return { fields, error: "can_drive must be boolean" };
    }
    fields.can_drive = canDrive;
  }
  if (payload.notes !== undefined) {
    fields.notes = payload.notes == null
      ? null
      : String(payload.notes).trim() || null;
  }

  return { fields };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const staffOrError = await requireStaff(req, admin);
    if ("error" in staffOrError) return staffOrError.error;
    const staff: StaffContext = staffOrError;

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const action = String(payload.action ?? "").trim().toLowerCase();

    // ------------------------------------------------------------------ list
    if (action === "list") {
      let query = admin.from("helpers").select(HELPER_SELECT).order(
        "full_name",
        { ascending: true },
      );

      const search = String(payload.search ?? "").trim().replace(/[%_,]/g, " ");
      if (search) {
        const like = `%${search}%`;
        query = query.or(
          `full_name.ilike.${JSON.stringify(like)},phone.ilike.${JSON.stringify(like)},home_area.ilike.${JSON.stringify(like)}`,
        );
      }
      const verification = String(payload.verification_status ?? "").trim();
      if (verification) {
        query = query.eq("verification_status", verification);
      }
      const active = parseBool(payload.is_active);
      if (active !== undefined) {
        query = query.eq("is_active", active);
      }
      const gender = String(payload.gender ?? "").trim().toLowerCase();
      if (gender === "female" || gender === "male") {
        query = query.eq("gender", gender);
      }
      const area = String(payload.area ?? "").trim();
      if (area) {
        query = query.ilike("home_area", `%${area}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      const helpers = (data ?? []) as HelperRow[];
      const counts = await upcomingJobCounts(
        admin,
        helpers.map((h) => h.id),
      );

      return jsonResponse({
        ok: true,
        helpers: helpers.map((h) => ({
          ...h,
          upcoming_assigned_jobs: counts.get(h.id) ?? 0,
          verification_progress: verificationProgress(h),
        })),
      });
    }

    // ------------------------------------------------------------------- get
    if (action === "get") {
      const helperId = String(payload.helper_id ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }
      const [jobs, { data: profile, error: profileError }] = await Promise.all([
        listUpcomingJobs(admin, helperId),
        admin
          .from("profiles")
          .select("user_id, full_name, role, helper_id, is_active, created_at")
          .eq("helper_id", helperId)
          .maybeSingle(),
      ]);
      if (profileError) throw profileError;

      return jsonResponse({
        ok: true,
        helper: {
          ...helper,
          verification_progress: verificationProgress(helper),
        },
        upcoming_jobs: jobs,
        login: profile ?? null,
        profile: profile ?? null,
      });
    }

    // ---------------------------------------------------------------- create
    if (action === "create") {
      const required = pickProfileFields({
        ...payload,
        full_name: payload.full_name,
        gender: payload.gender,
        email: payload.email,
        phone: payload.phone,
        home_area: payload.home_area,
        home_pincode: payload.home_pincode,
        max_travel_km: payload.max_travel_km ?? 10,
        languages: payload.languages,
        can_drive: payload.can_drive ?? false,
        notes: payload.notes,
      });
      if (required.error) {
        return jsonResponse({ ok: false, error: required.error }, 400);
      }
      for (
        const key of [
          "full_name",
          "gender",
          "email",
          "phone",
          "home_pincode",
        ] as const
      ) {
        if (required.fields[key] == null) {
          return jsonResponse({
            ok: false,
            error: `${key} required`,
          }, 400);
        }
      }

      const pin = String(required.fields.home_pincode);
      const city = await resolveCityFromPincode(admin, pin);
      const insertRow = {
        ...required.fields,
        city,
        verification_status: "pending",
        photo_status: "none",
        aadhaar_qr_verified: false,
        is_active: true,
      };

      const { data: created, error: createError } = await admin
        .from("helpers")
        .insert(insertRow)
        .select(HELPER_SELECT)
        .single();
      if (createError) {
        return jsonResponse({
          ok: false,
          error: createError.message.includes("unique")
            ? "Email already in use"
            : createError.message,
        }, 400);
      }

      await writeAudit(admin, staff, "create_helper", "helper", created.id, {
        email: created.email,
        full_name: created.full_name,
      });

      return jsonResponse({
        ok: true,
        helper: {
          ...created,
          verification_progress: verificationProgress(created as HelperRow),
        },
      });
    }

    // ---------------------------------------------------------------- update
    if (action === "update") {
      const helperId = String(payload.helper_id ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      const existing = await loadHelper(admin, helperId);
      if (!existing) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      const picked = pickProfileFields(payload);
      if (picked.error) {
        return jsonResponse({ ok: false, error: picked.error }, 400);
      }
      if (!Object.keys(picked.fields).length) {
        return jsonResponse({ ok: false, error: "No fields to update" }, 400);
      }

      if (typeof picked.fields.home_pincode === "string") {
        picked.fields.city = await resolveCityFromPincode(
          admin,
          picked.fields.home_pincode,
        );
      }

      // Drivers must keep driving_licence as second ID when both are set
      const nextCanDrive = picked.fields.can_drive === undefined
        ? existing.can_drive
        : Boolean(picked.fields.can_drive);
      if (
        nextCanDrive &&
        existing.second_id_type &&
        existing.second_id_type !== "driving_licence" &&
        picked.fields.can_drive === true
      ) {
        return jsonResponse({
          ok: false,
          error:
            "Drivers must use driving_licence as second ID. Update second ID first.",
        }, 400);
      }

      const { data: updated, error: updateError } = await admin
        .from("helpers")
        .update(picked.fields)
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (updateError) {
        return jsonResponse({
          ok: false,
          error: updateError.message.includes("unique")
            ? "Email already in use"
            : updateError.message,
        }, 400);
      }

      await writeAudit(admin, staff, "update_helper", "helper", helperId, {
        fields: Object.keys(picked.fields),
      });

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
      });
    }

    // ---------------------------------------------------------- save_aadhaar
    if (action === "save_aadhaar") {
      const helperId = String(payload.helper_id ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      if (payload.aadhaar_qr_verified !== true) {
        return jsonResponse({
          ok: false,
          error: "aadhaar_qr_verified must be true",
        }, 400);
      }

      // Never accept full Aadhaar
      if (
        payload.aadhaar !== undefined ||
        looksLikeFullAadhaar(payload.aadhaar_last4) ||
        (typeof payload.aadhaar_last4 === "string" &&
          payload.aadhaar_last4.length !== 4)
      ) {
        return jsonResponse({
          ok: false,
          error: "Only aadhaar_last4 (exactly 4 digits) is accepted. Never send full Aadhaar.",
        }, 400);
      }
      if (!isLast4(payload.aadhaar_last4)) {
        return jsonResponse({
          ok: false,
          error: "aadhaar_last4 must be exactly 4 digits",
        }, 400);
      }

      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      // Leave verification_status alone for rejected/expired (completing flow later)
      const { data: updated, error } = await admin
        .from("helpers")
        .update({
          aadhaar_qr_verified: true,
          aadhaar_last4: payload.aadhaar_last4,
          aadhaar_verified_at: new Date().toISOString(),
          aadhaar_verified_by: staff.user.id,
        })
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (error) throw error;

      await writeAudit(admin, staff, "save_aadhaar", "helper", helperId, {
        aadhaar_last4: payload.aadhaar_last4,
      });

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
      });
    }

    // -------------------------------------------------------- save_second_id
    if (action === "save_second_id") {
      const helperId = String(payload.helper_id ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      const secondIdType = String(payload.second_id_type ?? "").trim();
      if (!SECOND_ID_TYPES.has(secondIdType)) {
        return jsonResponse({
          ok: false,
          error: "second_id_type must be pan|voter_id|passport|driving_licence",
        }, 400);
      }
      if (!isLast4(payload.second_id_last4)) {
        return jsonResponse({
          ok: false,
          error: "second_id_last4 must be exactly 4 digits",
        }, 400);
      }

      let dlLast4 = payload.dl_last4 !== undefined
        ? String(payload.dl_last4)
        : undefined;
      let dlExpiry = payload.dl_expiry !== undefined
        ? String(payload.dl_expiry).trim()
        : undefined;

      if (secondIdType === "driving_licence" && !dlLast4) {
        dlLast4 = payload.second_id_last4;
      }

      if (helper.can_drive) {
        if (secondIdType !== "driving_licence") {
          return jsonResponse({
            ok: false,
            error: "Drivers must use driving_licence as second ID",
          }, 400);
        }
        if (!dlExpiry || !/^\d{4}-\d{2}-\d{2}$/.test(dlExpiry)) {
          return jsonResponse({
            ok: false,
            error: "dl_expiry (YYYY-MM-DD) required for drivers",
          }, 400);
        }
        if (dlExpiry <= todayIst()) {
          return jsonResponse({
            ok: false,
            error: "dl_expiry must be a future date (Asia/Kolkata)",
          }, 400);
        }
      } else if (secondIdType === "driving_licence" || dlExpiry) {
        if (dlExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(dlExpiry)) {
          return jsonResponse({
            ok: false,
            error: "dl_expiry must be YYYY-MM-DD",
          }, 400);
        }
        if (dlExpiry && helper.can_drive && dlExpiry <= todayIst()) {
          return jsonResponse({
            ok: false,
            error: "dl_expiry must be a future date",
          }, 400);
        }
      }

      if (dlLast4 !== undefined && dlLast4 !== "" && !isLast4(dlLast4)) {
        return jsonResponse({
          ok: false,
          error: "dl_last4 must be exactly 4 digits",
        }, 400);
      }

      const patch: Record<string, unknown> = {
        second_id_type: secondIdType,
        second_id_last4: payload.second_id_last4,
      };
      if (secondIdType === "driving_licence") {
        patch.dl_last4 = dlLast4 ?? payload.second_id_last4;
        if (dlExpiry) patch.dl_expiry = dlExpiry;
      } else if (!helper.can_drive) {
        // Clear DL fields when switching away from licence for non-drivers
        patch.dl_last4 = null;
        patch.dl_expiry = null;
      }

      const { data: updated, error } = await admin
        .from("helpers")
        .update(patch)
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (error) throw error;

      await writeAudit(admin, staff, "save_second_id", "helper", helperId, {
        second_id_type: secondIdType,
      });

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
      });
    }

    // -------------------------------------------------------- save_bg_check
    if (action === "save_bg_check") {
      const helperId = String(payload.helper_id ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      const method = String(payload.bg_check_method ?? "").trim();
      if (!BG_METHODS.has(method)) {
        return jsonResponse({
          ok: false,
          error: "bg_check_method must be police_certificate|vendor|in_house",
        }, 400);
      }
      const bgDate = String(payload.bg_check_date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bgDate)) {
        return jsonResponse({
          ok: false,
          error: "bg_check_date must be YYYY-MM-DD",
        }, 400);
      }

      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      const { data: updated, error } = await admin
        .from("helpers")
        .update({
          bg_check_method: method,
          bg_check_reference: payload.bg_check_reference == null
            ? null
            : String(payload.bg_check_reference).trim() || null,
          bg_check_notes: payload.bg_check_notes == null
            ? null
            : String(payload.bg_check_notes).trim() || null,
          bg_check_date: bgDate,
        })
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (error) throw error;

      await writeAudit(admin, staff, "save_bg_check", "helper", helperId, {
        bg_check_method: method,
        bg_check_date: bgDate,
      });

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
      });
    }

    // ------------------------------------------------------ save_references
    if (action === "save_references") {
      const helperId = String(payload.helper_id ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      const checked = parseBool(payload.references_checked);
      if (checked === undefined) {
        return jsonResponse({
          ok: false,
          error: "references_checked boolean required",
        }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      const { data: updated, error } = await admin
        .from("helpers")
        .update({
          references_checked: checked,
          references_notes: payload.references_notes == null
            ? null
            : String(payload.references_notes).trim() || null,
        })
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (error) throw error;

      await writeAudit(admin, staff, "save_references", "helper", helperId, {
        references_checked: checked,
      });

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
      });
    }

    // ---------------------------------------------------- photo_upload_url
    if (action === "photo_upload_url") {
      const helperId = String(payload.helper_id ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      const contentType = String(payload.content_type ?? "").trim()
        .toLowerCase();
      if (!PHOTO_CONTENT_TYPES.has(contentType)) {
        return jsonResponse({
          ok: false,
          error: "content_type must be image/jpeg or image/png",
        }, 400);
      }
      let ext = String(payload.file_ext ?? "").trim().toLowerCase()
        .replace(/^\./, "");
      if (!ext) {
        ext = contentType === "image/png" ? "png" : "jpg";
      }
      if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") {
        return jsonResponse({
          ok: false,
          error: "file_ext must be png, jpg, or jpeg",
        }, 400);
      }
      if (ext === "jpeg") ext = "jpg";

      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      const path = `${helperId}/${Date.now()}.${ext}`;
      const { data, error } = await admin.storage
        .from("helper-photos")
        .createSignedUploadUrl(path);
      if (error || !data) {
        return jsonResponse({
          ok: false,
          error: error?.message ?? "Could not create upload URL",
        }, 400);
      }

      await writeAudit(
        admin,
        staff,
        "request_photo_upload",
        "helper",
        helperId,
        { path, content_type: contentType },
      );

      return jsonResponse({
        ok: true,
        path: data.path ?? path,
        token: data.token,
        signedUrl: data.signedUrl,
      });
    }

    // ------------------------------------------------------ photo_confirm
    if (action === "photo_confirm") {
      const helperId = String(payload.helper_id ?? "").trim();
      const path = String(payload.path ?? "").trim();
      if (!helperId || !path) {
        return jsonResponse({
          ok: false,
          error: "helper_id and path required",
        }, 400);
      }
      if (!path.startsWith(`${helperId}/`)) {
        return jsonResponse({
          ok: false,
          error: "path must start with helper_id/",
        }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      const { data: updated, error } = await admin
        .from("helpers")
        .update({ photo_path: path, photo_status: "pending" })
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (error) throw error;

      await writeAudit(admin, staff, "photo_confirm", "helper", helperId, {
        path,
      });

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
      });
    }

    // --------------------------------------------------- photo_signed_url
    if (action === "photo_signed_url") {
      const helperId = String(payload.helper_id ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }
      if (!helper.photo_path) {
        return jsonResponse({
          ok: false,
          error: "No photo uploaded",
        }, 404);
      }

      const { data, error } = await admin.storage
        .from("helper-photos")
        .createSignedUrl(helper.photo_path, 300);
      if (error || !data?.signedUrl) {
        return jsonResponse({
          ok: false,
          error: error?.message ?? "Could not create signed URL",
        }, 400);
      }

      return jsonResponse({
        ok: true,
        signedUrl: data.signedUrl,
        path: helper.photo_path,
        expires_in: 300,
      });
    }

    // ------------------------------------------------------- photo_review
    if (action === "photo_review") {
      const helperId = String(payload.helper_id ?? "").trim();
      const decision = String(payload.decision ?? "").trim().toLowerCase();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      if (decision !== "approved" && decision !== "rejected") {
        return jsonResponse({
          ok: false,
          error: "decision must be approved or rejected",
        }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }
      if (!helper.photo_path) {
        return jsonResponse({
          ok: false,
          error: "No photo to review",
        }, 400);
      }

      const { data: updated, error } = await admin
        .from("helpers")
        .update({ photo_status: decision })
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (error) throw error;

      await writeAudit(admin, staff, "photo_review", "helper", helperId, {
        decision,
      });

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
      });
    }

    // ------------------------------------------------------- mark_verified
    if (action === "mark_verified") {
      const helperId = String(payload.helper_id ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      const progress = verificationProgress(helper);
      if (!progress.items.aadhaar) {
        return jsonResponse({
          ok: false,
          error: "Aadhaar QR verification and last4 required",
        }, 400);
      }
      if (!helper.second_id_type || !isLast4(helper.second_id_last4)) {
        return jsonResponse({
          ok: false,
          error: "Second ID type and last4 required",
        }, 400);
      }
      if (helper.can_drive) {
        if (helper.second_id_type !== "driving_licence") {
          return jsonResponse({
            ok: false,
            error: "Drivers require driving_licence as second ID",
          }, 400);
        }
        if (!helper.dl_expiry || helper.dl_expiry <= todayIst()) {
          return jsonResponse({
            ok: false,
            error: "Drivers require a future DL expiry date",
          }, 400);
        }
      }
      if (!helper.bg_check_method || !helper.bg_check_date) {
        return jsonResponse({
          ok: false,
          error: "Background check method and date required",
        }, 400);
      }
      if (helper.photo_status !== "approved") {
        return jsonResponse({
          ok: false,
          error: "Photo must be approved",
        }, 400);
      }

      const { data: updated, error } = await admin
        .from("helpers")
        .update({
          verification_status: "verified",
          verified_at: new Date().toISOString(),
          verified_by: staff.user.id,
          rejection_reason: null,
        })
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (error) throw error;

      await writeAudit(admin, staff, "mark_verified", "helper", helperId, {});

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
      });
    }

    // ----------------------------------------------------------------- reject
    if (action === "reject") {
      const helperId = String(payload.helper_id ?? "").trim();
      const reason = String(payload.rejection_reason ?? "").trim();
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      if (!reason) {
        return jsonResponse({
          ok: false,
          error: "rejection_reason required",
        }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      const jobs = await listUpcomingJobs(admin, helperId);
      if (jobs.length > 0 && payload.confirm !== true) {
        return jsonResponse({
          ok: false,
          code: "needs_confirmation",
          jobs,
          message:
            `${helper.full_name} has ${jobs.length} upcoming assigned job(s). Confirm to release and reject.`,
        });
      }

      let released: { request_id: string; helper_id: string }[] = [];
      if (jobs.length > 0) {
        released = await releaseHelperJobs(
          admin,
          helperId,
          jobs,
          "Helper verification rejected",
        );
      } else {
        await admin.rpc("withdraw_helper_open_offers", {
          p_helper_id: helperId,
        });
      }

      const { data: updated, error } = await admin
        .from("helpers")
        .update({
          verification_status: "rejected",
          rejection_reason: reason,
        })
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (error) throw error;

      await writeAudit(admin, staff, "reject_helper", "helper", helperId, {
        rejection_reason: reason,
        released_count: released.length,
      });

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
        released,
      });
    }

    // ------------------------------------------------------------- set_active
    if (action === "set_active") {
      const helperId = String(payload.helper_id ?? "").trim();
      const nextActive = parseBool(payload.is_active);
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      if (nextActive === undefined) {
        return jsonResponse({
          ok: false,
          error: "is_active boolean required",
        }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }

      let released: { request_id: string; helper_id: string }[] = [];
      if (!nextActive) {
        const jobs = await listUpcomingJobs(admin, helperId);
        if (jobs.length > 0 && payload.confirm !== true) {
          return jsonResponse({
            ok: false,
            code: "needs_confirmation",
            jobs,
            message:
              `${helper.full_name} has ${jobs.length} upcoming assigned job(s). Confirm to release and deactivate.`,
          });
        }
        if (jobs.length > 0) {
          released = await releaseHelperJobs(
            admin,
            helperId,
            jobs,
            "Helper deactivated",
          );
        } else {
          await admin.rpc("withdraw_helper_open_offers", {
            p_helper_id: helperId,
          });
        }
      }

      const { data: updated, error } = await admin
        .from("helpers")
        .update({ is_active: nextActive })
        .eq("id", helperId)
        .select(HELPER_SELECT)
        .single();
      if (error) throw error;

      await writeAudit(
        admin,
        staff,
        nextActive ? "activate_helper" : "deactivate_helper",
        "helper",
        helperId,
        { released_count: released.length },
      );

      return jsonResponse({
        ok: true,
        helper: {
          ...updated,
          verification_progress: verificationProgress(updated as HelperRow),
        },
        released,
      });
    }

    // ---------------------------------------------------------- create_login
    if (action === "create_login") {
      const helperId = String(payload.helper_id ?? "").trim();
      const password = String(payload.password ?? "");
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      if (password.length < 8) {
        return jsonResponse({
          ok: false,
          error: "password must be at least 8 characters",
        }, 400);
      }
      const helper = await loadHelper(admin, helperId);
      if (!helper) {
        return jsonResponse({ ok: false, error: "Helper not found" }, 404);
      }
      if (helper.verification_status !== "verified") {
        return jsonResponse({
          ok: false,
          error: "Helper must be verified before creating a login",
        }, 400);
      }

      const { data: existingProfile, error: existingError } = await admin
        .from("profiles")
        .select("user_id")
        .eq("helper_id", helperId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingProfile) {
        return jsonResponse({
          ok: false,
          error: "Login profile already exists for this helper",
        }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin
        .createUser({
          email: helper.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: helper.full_name, role: "helper" },
        });
      if (createError || !created.user) {
        return jsonResponse({
          ok: false,
          error: createError?.message ?? "Could not create auth user",
        }, 400);
      }

      const { error: profileError } = await admin.from("profiles").insert({
        user_id: created.user.id,
        full_name: helper.full_name,
        role: "helper",
        helper_id: helperId,
        is_active: true,
        created_by: staff.user.id,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return jsonResponse({
          ok: false,
          error: profileError.message,
        }, 400);
      }

      await writeAudit(admin, staff, "create_helper_login", "helper", helperId, {
        user_id: created.user.id,
        email: helper.email,
      });

      return jsonResponse({
        ok: true,
        user_id: created.user.id,
        email: helper.email,
        message: `Login created for ${helper.email}.`,
      });
    }

    // ----------------------------------------------------- set_login_active
    if (action === "set_login_active") {
      const helperId = String(payload.helper_id ?? "").trim();
      const nextActive = parseBool(payload.is_active);
      if (!helperId) {
        return jsonResponse({ ok: false, error: "helper_id required" }, 400);
      }
      if (nextActive === undefined) {
        return jsonResponse({
          ok: false,
          error: "is_active boolean required",
        }, 400);
      }

      const { data: profile, error: loadError } = await admin
        .from("profiles")
        .select("user_id, full_name, role, helper_id, is_active")
        .eq("helper_id", helperId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!profile) {
        return jsonResponse({
          ok: false,
          error: "No login profile for this helper",
        }, 404);
      }

      const { error: updateError } = await admin
        .from("profiles")
        .update({ is_active: nextActive })
        .eq("helper_id", helperId);
      if (updateError) throw updateError;

      if (!nextActive) {
        try {
          await admin.auth.admin.signOut(profile.user_id, "global");
        } catch (signOutError) {
          console.error("signOut after set_login_active", signOutError);
        }
      }

      await writeAudit(
        admin,
        staff,
        nextActive ? "activate_helper_login" : "deactivate_helper_login",
        "helper",
        helperId,
        { user_id: profile.user_id },
      );

      return jsonResponse({
        ok: true,
        profile: { ...profile, is_active: nextActive },
      });
    }

    // --------------------------------------------- seed_placeholder_photos
    if (action === "seed_placeholder_photos") {
      const { data: helpers, error } = await admin
        .from("helpers")
        .select("id, photo_path, notes")
        .not("photo_path", "is", null);
      if (error) throw error;

      const results: Record<string, unknown>[] = [];
      for (const helper of helpers ?? []) {
        const path = String(helper.photo_path ?? "");
        if (!path) continue;

        const { data: existing, error: downloadError } = await admin.storage
          .from("helper-photos")
          .download(path);

        if (!downloadError && existing) {
          results.push({ helper_id: helper.id, path, status: "exists" });
          continue;
        }

        const { error: uploadError } = await admin.storage
          .from("helper-photos")
          .upload(path, PNG_1X1, {
            contentType: "image/png",
            upsert: true,
          });
        if (uploadError) {
          results.push({
            helper_id: helper.id,
            path,
            status: "error",
            error: uploadError.message,
          });
        } else {
          results.push({ helper_id: helper.id, path, status: "uploaded" });
        }
      }

      await writeAudit(
        admin,
        staff,
        "seed_placeholder_photos",
        "helper",
        null,
        { count: results.length },
      );

      return jsonResponse({ ok: true, results });
    }

    return jsonResponse({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
