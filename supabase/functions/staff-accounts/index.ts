import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireStaff, writeAudit } from "../_shared/staff-auth.ts";

type Payload = {
  action?: string;
  email?: string;
  full_name?: string;
  password?: string;
  user_id?: string;
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

    const staffOrError = await requireStaff(req, admin, { superAdminOnly: true });
    if ("error" in staffOrError) return staffOrError.error;
    const staff = staffOrError;

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const action = String(payload.action ?? "").trim().toLowerCase();

    if (action === "create_manager") {
      const email = String(payload.email ?? "").trim().toLowerCase();
      const fullName = String(payload.full_name ?? "").trim();
      const password = String(payload.password ?? "");
      if (!email || !fullName || password.length < 8) {
        return jsonResponse({
          ok: false,
          error: "email, full_name, and password (min 8) required",
        }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin
        .createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
      if (createError || !created.user) {
        return jsonResponse({
          ok: false,
          error: createError?.message ?? "Could not create user",
        }, 400);
      }

      const { error: profileError } = await admin.from("profiles").insert({
        user_id: created.user.id,
        full_name: fullName,
        role: "manager",
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

      await writeAudit(admin, staff, "create_manager", "profile", created.user.id, {
        email,
        full_name: fullName,
      });

      return jsonResponse({
        ok: true,
        message: `Manager account created for ${email}.`,
        user_id: created.user.id,
      });
    }

    if (action === "deactivate" || action === "reactivate") {
      const userId = String(payload.user_id ?? "").trim();
      if (!userId) {
        return jsonResponse({ ok: false, error: "user_id required" }, 400);
      }
      if (userId === staff.user.id) {
        return jsonResponse({
          ok: false,
          error: "You cannot deactivate your own account.",
        }, 400);
      }

      const { data: profile, error: loadError } = await admin
        .from("profiles")
        .select("user_id, role, is_active, full_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!profile) {
        return jsonResponse({ ok: false, error: "Profile not found" }, 404);
      }
      if (profile.role === "super_admin") {
        return jsonResponse({
          ok: false,
          error: "Super Admin accounts cannot be deactivated here.",
        }, 400);
      }

      const nextActive = action === "reactivate";
      const { error: updateError } = await admin
        .from("profiles")
        .update({ is_active: nextActive })
        .eq("user_id", userId);
      if (updateError) throw updateError;

      if (!nextActive) {
        // Best-effort: sign out all sessions for deactivated users
        try {
          await admin.auth.admin.signOut(userId, "global");
        } catch (signOutError) {
          console.error("signOut after deactivate", signOutError);
        }
      }

      await writeAudit(admin, staff, action, "profile", userId, {
        role: profile.role,
        full_name: profile.full_name,
      });

      return jsonResponse({
        ok: true,
        message: nextActive
          ? `${profile.full_name} reactivated.`
          : `${profile.full_name} deactivated.`,
      });
    }

    return jsonResponse({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
