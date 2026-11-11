import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  escapeHtml,
  formatAppointmentDateTime,
  sendEmail,
} from "../_shared/email.ts";

type ConsultationRecord = {
  id: string;
  parent_name: string;
  parent_age: number;
  city: string;
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
    const record: ConsultationRecord | undefined =
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

    const bookingName = escapeHtml(record.booking_person_name);
    const parentName = escapeHtml(record.parent_name);
    const parentAge = escapeHtml(String(record.parent_age));
    const city = escapeHtml(record.city);
    const doctorHospital = escapeHtml(
      String(record.doctor_hospital ?? "").trim() || "Not provided",
    );
    const appointmentLabel = formatAppointmentDateTime(
      record.appointment_date,
      record.appointment_time,
    );
    const appointmentHtml = appointmentLabel
      ? escapeHtml(appointmentLabel)
      : "Not provided";

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <p>Hi ${bookingName},</p>
        <p>
          Thank you for requesting a consultation with <strong>ABI Parent Care</strong>.
          We have received your request for
          <strong>${parentName}</strong> (age ${parentAge}) in <strong>${city}</strong>.
        </p>
        <p>
          Appointment: <strong>${appointmentHtml}</strong><br />
          Doctor / Hospital: <strong>${doctorHospital}</strong>
        </p>
        <p>Our care advisor will contact you within 24 hours.</p>
        <p>Warm regards,<br />ABI Parent Care</p>
      </div>
    `;

    const emailResult = await sendEmail({
      to: record.email,
      toName: record.booking_person_name,
      subject: "We received your consultation request",
      html,
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

    const supabase = createClient(supabaseUrl, serviceRoleKey);
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
