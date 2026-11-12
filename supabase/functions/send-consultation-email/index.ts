import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";
import { templateG1 } from "../_shared/templates.ts";

type ConsultationRecord = {
  id: string;
  ref_number?: string | null;
  parent_name: string;
  parent_age: number;
  city: string;
  area?: string | null;
  pincode?: string | null;
  booking_person_name: string;
  relationship: string;
  email: string;
  phone_country_code: string;
  phone: string;
  appointment_date?: string | null;
  appointment_time?: string | null;
  doctor_hospital?: string | null;
  helper_preference?: string | null;
  created_at?: string;
  email_sent_at?: string | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: ConsultationRecord;
  old_record?: ConsultationRecord | null;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment configuration");
    }

    const payload = (await req.json()) as WebhookPayload | ConsultationRecord;
    let record: ConsultationRecord | undefined =
      "record" in payload && payload.record
        ? payload.record
        : "email" in payload && "id" in payload
        ? (payload as ConsultationRecord)
        : undefined;

    if (!record?.id || !record.email || !record.booking_person_name) {
      return new Response(
        JSON.stringify({ error: "Invalid consultation payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Ensure we have ref_number and latest fields (webhook payload may be stale)
    const { data: fresh, error: loadError } = await supabase
      .from("consultation_requests")
      .select(
        "id, ref_number, parent_name, parent_age, city, area, pincode, booking_person_name, email, appointment_date, appointment_time, doctor_hospital, helper_preference",
      )
      .eq("id", record.id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (fresh) record = { ...record, ...fresh };

    const email = templateG1({
      ref: String(record.ref_number ?? "–"),
      booking_person_name: record.booking_person_name,
      parent_name: record.parent_name,
      appointment_date: String(record.appointment_date ?? ""),
      appointment_time: String(record.appointment_time ?? ""),
      doctor_hospital: String(record.doctor_hospital ?? ""),
      area: record.area,
      city: record.city,
      pincode: record.pincode,
      helper_preference: record.helper_preference,
    });

    const emailResult = await sendEmail({
      to: record.email,
      toName: record.booking_person_name,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    if (!emailResult.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          details: emailResult.error,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const { error: updateError } = await supabase
      .from("consultation_requests")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", record.id);

    if (updateError) {
      console.error("Failed to update email_sent_at:", updateError);
      return new Response(
        JSON.stringify({
          error: "Email sent but failed to update email_sent_at",
          details: updateError.message,
          email: emailResult,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, email: emailResult }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
