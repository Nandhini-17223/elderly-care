import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAppointmentDateTime(
  appointmentDate?: string | null,
  appointmentTime?: string | null,
): string | null {
  if (!appointmentDate || !appointmentTime) return null;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(appointmentDate.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(appointmentTime.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour24 = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour24) ||
    !Number.isInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour24 < 0 ||
    hour24 > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const hour12 = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? "AM" : "PM";
  return `${day} ${months[month - 1]} ${year}, ${hour12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!resendApiKey) {
      throw new Error("Missing RESEND_API_KEY secret");
    }
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

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "ABI Parent Care <onboarding@resend.dev>",
        to: [record.email],
        subject: "We received your consultation request",
        html,
      }),
    });

    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error("Resend error:", emailResult);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: emailResult }),
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

    return new Response(
      JSON.stringify({ ok: true, email: emailResult }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
