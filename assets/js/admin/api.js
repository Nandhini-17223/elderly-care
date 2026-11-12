(function (global) {
  const cfg = global.AdminConfig;

  async function callStaffApi(body) {
    const token = await global.AdminAuth.accessToken();
    if (!token) {
      return {
        response: { status: 401 },
        payload: { ok: false, error: "Unauthorized" },
      };
    }
    const response = await fetch(cfg.FUNCTIONS_BASE + "/senior-api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(function () {
      return {};
    });
    return { response: response, payload: payload };
  }

  async function callStaffAccounts(body) {
    const token = await global.AdminAuth.accessToken();
    if (!token) {
      return {
        response: { status: 401 },
        payload: { ok: false, error: "Unauthorized" },
      };
    }
    const response = await fetch(cfg.FUNCTIONS_BASE + "/staff-accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(function () {
      return {};
    });
    return { response: response, payload: payload };
  }

  async function callHelperAdmin(body) {
    const token = await global.AdminAuth.accessToken();
    if (!token) {
      return {
        response: { status: 401 },
        payload: { ok: false, error: "Unauthorized" },
      };
    }
    const response = await fetch(cfg.FUNCTIONS_BASE + "/helper-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(function () {
      return {};
    });
    return { response: response, payload: payload };
  }

  function formatIstDate(isoOrDate) {
    if (!isoOrDate) return "—";
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return String(isoOrDate);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: cfg.IST,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  }

  function formatIstTime(isoOrTime) {
    if (!isoOrTime) return "—";
    if (/^\d{2}:\d{2}/.test(String(isoOrTime))) {
      const parts = String(isoOrTime).slice(0, 8).split(":");
      const date = new Date();
      date.setHours(Number(parts[0]), Number(parts[1]), Number(parts[2] || 0), 0);
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: cfg.IST,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    }
    const d = new Date(isoOrTime);
    if (Number.isNaN(d.getTime())) return String(isoOrTime);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: cfg.IST,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  }

  function formatIstDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: cfg.IST,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  }

  function todayIstDateString() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: cfg.IST,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function addDaysIst(dateStr, days) {
    const base = new Date(dateStr + "T12:00:00+05:30");
    base.setDate(base.getDate() + days);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: cfg.IST,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(base);
  }

  function firstName(fullName) {
    const trimmed = String(fullName || "").trim();
    if (!trimmed) return "Patient";
    return trimmed.split(/\s+/)[0] || trimmed;
  }

  function confirmationLabel(row) {
    if (row.status === "cancelled") return { icon: "⚠", text: "not confirmed" };
    if (row.helper_confirmed_at) return { icon: "✅", text: "confirmed" };
    if (row.status === "assigned" || row.status === "senior_offered") {
      return { icon: "⏳", text: "awaiting" };
    }
    if (row.status === "needs_senior") return { icon: "⚠", text: "not confirmed" };
    return { icon: "⏳", text: "awaiting" };
  }

  global.AdminApi = {
    callStaffApi: callStaffApi,
    callStaffAccounts: callStaffAccounts,
    callHelperAdmin: callHelperAdmin,
    formatIstDate: formatIstDate,
    formatIstTime: formatIstTime,
    formatIstDateTime: formatIstDateTime,
    todayIstDateString: todayIstDateString,
    addDaysIst: addDaysIst,
    firstName: firstName,
    confirmationLabel: confirmationLabel,
  };
})(window);
