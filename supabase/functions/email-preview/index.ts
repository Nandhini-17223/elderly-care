/**
 * One-off preview batch: sends every approved template (G1–G5, H1–H5, M1–M9)
 * to TEST_EMAIL_TO with subject prefix "[PREVIEW G1]", etc.
 *
 * Run again (service role always; anon key only while EMAIL_TEST_MODE=true):
 *   curl -X POST "$SUPABASE_URL/functions/v1/email-preview" \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
 *     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"confirm":"send-all-previews"}'
 *
 * Optional: pass {"confirm":"send-all-previews","only":["G1","H1"]} to send a subset.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { HELPER_APP_LINK, sendEmail } from "../_shared/email.ts";
import {
  ADMIN_PAGE_BASE,
  MANAGER_FIRST_NAME,
  RESPOND_BASE,
  helperProfileUrl,
  needsActionUrl,
  seniorAssignUrl,
} from "../_shared/senior.ts";
import {
  templateG1,
  templateG2,
  templateG3,
  templateG4,
  templateG5,
  templateH1,
  templateH2,
  templateH3,
  templateH4,
  templateH5,
  templateM1,
  templateM2,
  templateM3,
  templateM4,
  templateM5,
  templateM6,
  templateM7,
  templateM8,
  templateM9,
  type EmailContent,
} from "../_shared/templates.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", Connection: "keep-alive" },
  });
}

function sampleTemplates(): EmailContent[] {
  // Realistic fake data — appointment a few days out in Asia/Kolkata terms
  const appointment_date = "2026-11-13";
  const appointment_time = "10:00:00";
  const ref = "ABI-1042";
  const requestId = "00000000-0000-4000-8000-000000000001";
  const helperId = "00000000-0000-4000-8000-000000000002";
  const acceptUrl = `${RESPOND_BASE}?token=preview-token&action=accept`;
  const declineUrl = `${RESPOND_BASE}?token=preview-token&action=decline`;
  const cantMakeIt = `${RESPOND_BASE}?token=preview-token&action=cant_make_it`;
  const confirmUrl =
    `${RESPOND_BASE}?token=preview-token&action=confirm_attendance`;
  const maps =
    "https://www.google.com/maps/search/?api=1&query=12%20Gandhi%20Street%20T%20Nagar%20Chennai";
  const fullAddress =
    "12 Gandhi Street, T. Nagar, Chennai, 600017";

  return [
    templateG1({
      ref,
      booking_person_name: "Priya Sharma",
      parent_name: "Ramesh Sharma",
      appointment_date,
      appointment_time,
      doctor_hospital: "Apollo Hospitals, Greams Road",
      area: "T. Nagar",
      city: "Chennai",
      pincode: "600017",
      helper_preference: "female",
    }),
    templateG2({
      ref,
      booking_person_name: "Priya Sharma",
      parent_name: "Ramesh Sharma",
      appointment_date,
      appointment_time,
    }),
    templateG3({
      ref,
      booking_person_name: "Priya Sharma",
      parent_name: "Ramesh Sharma",
      helper_full_name: "Anitha Kumar",
      helper_phone: "+91 98765 43210",
      helper_photo_url: null,
      appointment_date,
      appointment_time,
      doctor_hospital: "Apollo Hospitals, Greams Road",
      address_line1: "12 Gandhi Street",
      street: "Near Pondy Bazaar",
      area: "T. Nagar",
      city: "Chennai",
      pincode: "600017",
    }),
    templateG4({
      ref,
      booking_person_name: "Priya Sharma",
      parent_name: "Ramesh Sharma",
      old_helper_first_name: "Anitha",
      appointment_date,
      appointment_time,
    }),
    templateG5({
      ref,
      booking_person_name: "Priya Sharma",
      parent_name: "Ramesh Sharma",
      helper_full_name: "Kavitha Rajan",
      helper_phone: "+91 91234 56789",
      helper_photo_url: null,
      old_helper_first_name: "Anitha",
      appointment_date,
      appointment_time,
      doctor_hospital: "Apollo Hospitals, Greams Road",
    }),
    templateH1({
      ref,
      helper_first_name: "Anitha",
      appointment_date,
      appointment_time,
      area: "T. Nagar",
      pincode: "600017",
      distance_km: 3.4,
      doctor_hospital: "Apollo Hospitals, Greams Road",
      parent_age: 72,
      accept_url: acceptUrl,
      decline_url: declineUrl,
    }),
    templateH2({
      ref,
      helper_first_name: "Anitha",
      parent_name: "Ramesh Sharma",
      parent_age: 72,
      address_line1: "12 Gandhi Street",
      street: "Near Pondy Bazaar",
      area: "T. Nagar",
      city: "Chennai",
      pincode: "600017",
      landmark: "Opposite ICICI Bank",
      maps_url: maps,
      appointment_date,
      appointment_time,
      doctor_hospital: "Apollo Hospitals, Greams Road",
      booking_person_name: "Priya Sharma",
      relationship: "Daughter",
      guardian_phone: "+91 99887 76655",
      cant_make_it_url: cantMakeIt,
    }),
    templateH3({
      ref,
      helper_first_name: "Anitha",
      parent_name: "Ramesh Sharma",
      area: "T. Nagar",
      appointment_date,
      appointment_time,
      full_address: fullAddress,
      maps_url: maps,
      doctor_hospital: "Apollo Hospitals, Greams Road",
      booking_person_name: "Priya Sharma",
      relationship: "Daughter",
      guardian_phone: "+91 99887 76655",
      cant_make_it_url: cantMakeIt,
    }),
    templateH4({
      ref,
      helper_first_name: "Anitha",
      parent_name: "Ramesh Sharma",
      area: "T. Nagar",
      appointment_date,
      appointment_time,
      full_address: fullAddress,
      maps_url: maps,
      doctor_hospital: "Apollo Hospitals, Greams Road",
      booking_person_name: "Priya Sharma",
      relationship: "Daughter",
      guardian_phone: "+91 99887 76655",
      cant_make_it_url: cantMakeIt,
      confirm_url: confirmUrl,
    }),
    templateH5({
      helper_first_name: "Anitha",
      helper_email: "anitha.helper@example.com",
      helper_app_link: HELPER_APP_LINK,
    }),
    templateM1({
      ref,
      manager_first_name: MANAGER_FIRST_NAME,
      parent_name: "Ramesh Sharma",
      parent_age: 72,
      appointment_date,
      appointment_time,
      area: "T. Nagar",
      city: "Chennai",
      pincode: "600017",
      doctor_hospital: "Apollo Hospitals, Greams Road",
      helper_preference: "female",
      booking_person_name: "Priya Sharma",
      relationship: "Daughter",
      guardian_phone: "+91 99887 76655",
      time_remaining: "2 hours",
      assign_url: seniorAssignUrl(requestId),
    }),
    templateM2({
      manager_first_name: MANAGER_FIRST_NAME,
      digest_time: "1:00 PM",
      open_all_url: needsActionUrl(),
      items: [
        {
          ref: "ABI-1042",
          parent_name: "Ramesh Sharma",
          parent_age: 72,
          appointment_date,
          appointment_time,
          area: "T. Nagar",
          pincode: "600017",
          helper_preference: "female",
          reason: "no_acceptance",
          assign_url: seniorAssignUrl(requestId),
        },
        {
          ref: "ABI-1043",
          parent_name: "Lakshmi Iyer",
          parent_age: 68,
          appointment_date: "2026-11-14",
          appointment_time: "15:30:00",
          area: "Adyar",
          pincode: "600020",
          helper_preference: "no_preference",
          reason: "all_declined",
          assign_url: seniorAssignUrl(requestId),
        },
      ],
    }),
    templateM3({
      ref,
      manager_first_name: MANAGER_FIRST_NAME,
      helper_full_name: "Anitha Kumar",
      parent_name: "Ramesh Sharma",
      appointment_date,
      appointment_time,
      area: "T. Nagar",
      decline_reason: null,
      assign_url: seniorAssignUrl(requestId),
    }),
    templateM4({
      ref,
      manager_first_name: MANAGER_FIRST_NAME,
      helper_full_name: "Anitha Kumar",
      helper_phone: "+91 98765 43210",
      parent_name: "Ramesh Sharma",
      appointment_date,
      appointment_time,
      area: "T. Nagar",
      expiry_window: "1 hour",
      assign_url: seniorAssignUrl(requestId),
    }),
    templateM5({
      ref,
      manager_first_name: MANAGER_FIRST_NAME,
      helper_full_name: "Anitha Kumar",
      parent_name: "Ramesh Sharma",
      parent_age: 72,
      appointment_date,
      appointment_time,
      area: "T. Nagar",
      city: "Chennai",
      pincode: "600017",
      doctor_hospital: "Apollo Hospitals, Greams Road",
      booking_person_name: "Priya Sharma",
      relationship: "Daughter",
      guardian_phone: "+91 99887 76655",
      dropout_reason: "Feeling unwell",
      assign_url: seniorAssignUrl(requestId),
    }),
    templateM6({
      ref,
      manager_first_name: MANAGER_FIRST_NAME,
      helper_full_name: "Anitha Kumar",
      helper_first_name: "Anitha",
      helper_phone: "+91 98765 43210",
      parent_name: "Ramesh Sharma",
      parent_age: 72,
      appointment_date,
      appointment_time,
      area: "T. Nagar",
      city: "Chennai",
      pincode: "600017",
      doctor_hospital: "Apollo Hospitals, Greams Road",
      assigned_at: "2026-11-12T04:30:00.000Z",
      r12_status: "sent",
      r6_status: "sent",
      open_url: seniorAssignUrl(requestId),
    }),
    templateM7({
      ref,
      manager_first_name: MANAGER_FIRST_NAME,
      helper_full_name: "Anitha Kumar",
      helper_first_name: "Anitha",
      helper_phone: "+91 98765 43210",
      parent_name: "Ramesh Sharma",
      parent_age: 72,
      appointment_date,
      appointment_time,
      area: "T. Nagar",
      city: "Chennai",
      pincode: "600017",
      doctor_hospital: "Apollo Hospitals, Greams Road",
      assigned_at: "2026-11-12T04:30:00.000Z",
      r12_status: "sent",
      r6_status: "sent",
      open_url: seniorAssignUrl(requestId),
    }),
    templateM8({
      manager_first_name: MANAGER_FIRST_NAME,
      helper_full_name: "Anitha Kumar",
      expiry_phrase: "expires in 30 days",
      dl_expiry: "2026-12-12",
      upcoming_count: 2,
      open_url: helperProfileUrl(helperId),
      expired: false,
    }),
    templateM9({
      manager_first_name: MANAGER_FIRST_NAME,
      helper_full_name: "Anitha Kumar",
      request_note: "Please update my phone number and home pincode.",
      open_url: helperProfileUrl(helperId),
    }),
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const testMode = Deno.env.get("EMAIL_TEST_MODE") === "true";
    // Allow service role always; allow anon for this preview-only function
    // (batch always sends to TEST_EMAIL_TO, never to sample recipient addresses).
    const authorized = Boolean(
      (serviceRoleKey && bearer === serviceRoleKey) ||
        (anonKey && bearer === anonKey) ||
        (testMode && anonKey && bearer === anonKey),
    );
    if (!authorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload = await req.json().catch(() => ({})) as {
      confirm?: string;
      only?: string[];
    };
    if (payload.confirm !== "send-all-previews") {
      return jsonResponse({
        error: 'Pass {"confirm":"send-all-previews"} to send the batch',
        hint:
          "Subjects are prefixed [PREVIEW G1], [PREVIEW H1], etc. Test mode still redirects to TEST_EMAIL_TO.",
      }, 400);
    }

    const testTo = Deno.env.get("TEST_EMAIL_TO")?.trim();
    if (!testTo) {
      return jsonResponse({ error: "TEST_EMAIL_TO is not set" }, 500);
    }

    const templates = sampleTemplates().filter((t) =>
      !payload.only?.length || payload.only.includes(t.id)
    );

    const results: Record<string, unknown>[] = [];
    for (const email of templates) {
      const subject = `[PREVIEW ${email.id}] ${email.subject}`;
      const sent = await sendEmail({
        to: testTo,
        toName: "Preview inbox",
        subject,
        html: email.html,
        text: email.text,
      });
      results.push({
        id: email.id,
        ok: sent.ok,
        email_id: sent.id,
        subject: sent.subject,
        to: sent.to,
        testMode: sent.testMode,
        error: sent.error,
      });
      // brief pause to avoid Resend rate limits
      await new Promise((r) => setTimeout(r, 400));
    }

    return jsonResponse({
      ok: results.every((r) => r.ok),
      count: results.length,
      portal_base: ADMIN_PAGE_BASE,
      results,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
