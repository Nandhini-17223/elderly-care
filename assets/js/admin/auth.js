(function (global) {
  const cfg = global.AdminConfig;
  let client = null;
  let cachedProfile = null;

  function getClient() {
    if (client) return client;
    if (!global.supabase || !global.supabase.createClient) {
      throw new Error("Supabase client library not loaded");
    }
    client = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "abi-staff-auth",
      },
    });
    return client;
  }

  function pageName() {
    const parts = window.location.pathname.split("/");
    return parts[parts.length - 1] || "index.html";
  }

  function loginUrl(nextPath) {
    const next = nextPath || window.location.pathname.split("/").pop() + window.location.search;
    const url = new URL("login.html", window.location.href);
    if (next && next !== "login.html") {
      url.searchParams.set("next", next);
    }
    return url.pathname.split("/").pop() + url.search;
  }

  function homeForRole(role) {
    if (role === "helper") return loginUrl();
    return "index.html";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function fetchProfile(userId) {
    const sb = getClient();
    const { data, error } = await sb
      .from("profiles")
      .select("user_id, full_name, role, helper_id, is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function getSessionProfile() {
    const sb = getClient();
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (!session) {
      cachedProfile = null;
      return { session: null, profile: null, user: null };
    }
    const profile = await fetchProfile(session.user.id);
    cachedProfile = profile;
    return { session: session, profile: profile, user: session.user };
  }

  function isStaffProfile(profile) {
    return Boolean(
      profile &&
        profile.is_active &&
        cfg.STAFF_ROLES.indexOf(profile.role) !== -1
    );
  }

  function requireSuperAdmin(profile) {
    return Boolean(profile && profile.is_active && profile.role === "super_admin");
  }

  async function requireStaff(options) {
    const opts = options || {};
    const result = await getSessionProfile();
    if (!result.session || !isStaffProfile(result.profile)) {
      if (result.session && result.profile && result.profile.role === "helper") {
        await getClient().auth.signOut();
      }
      window.location.replace(loginUrl());
      return null;
    }
    if (opts.superAdminOnly && !requireSuperAdmin(result.profile)) {
      window.location.replace("index.html");
      return null;
    }
    const current = pageName();
    if (
      cfg.SUPER_ADMIN_ONLY.indexOf(current) !== -1 &&
      !requireSuperAdmin(result.profile)
    ) {
      window.location.replace("index.html");
      return null;
    }
    renderChrome(result.profile, result.user);
    return result;
  }

  function renderChrome(profile, user) {
    const nav = document.querySelector("[data-admin-nav]");
    const userSlot = document.querySelector("[data-admin-user]");
    const logoutBtn = document.querySelector("[data-admin-logout]");
    if (nav) {
      const links = [
        { href: "index.html", label: "Dashboard" },
        { href: "needs-action.html", label: "Needs action" },
        { href: "requests.html", label: "All requests" },
      ];
      if (profile.role === "super_admin") {
        links.push(
          { href: "audit.html", label: "Audit log" },
          { href: "staff.html", label: "Staff accounts" },
          { href: "settings.html", label: "Settings" }
        );
      }
      const current = pageName();
      nav.innerHTML = links
        .map(function (link) {
          const active = current === link.href ? ' aria-current="page"' : "";
          return (
            '<a href="' +
            link.href +
            '"' +
            active +
            ">" +
            escapeHtml(link.label) +
            "</a>"
          );
        })
        .join("");
    }
    if (userSlot) {
      userSlot.textContent =
        (profile.full_name || "Staff") +
        " · " +
        (profile.role === "super_admin" ? "Super Admin" : "Manager") +
        (user && user.email ? " · " + user.email : "");
    }
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = "1";
      logoutBtn.addEventListener("click", async function () {
        await getClient().auth.signOut();
        window.location.replace("login.html");
      });
    }
  }

  const LOGIN_FAIL_KEY = "abi-staff-login-fails";

  function readFailState() {
    try {
      return JSON.parse(localStorage.getItem(LOGIN_FAIL_KEY) || "{}");
    } catch (_err) {
      return {};
    }
  }

  function writeFailState(state) {
    localStorage.setItem(LOGIN_FAIL_KEY, JSON.stringify(state));
  }

  function loginThrottleMs() {
    const state = readFailState();
    const fails = Number(state.count) || 0;
    if (fails < 3) return 0;
    if (fails < 5) return 2000;
    if (fails < 8) return 5000;
    return 15000;
  }

  function recordLoginFailure() {
    const state = readFailState();
    state.count = (Number(state.count) || 0) + 1;
    state.at = Date.now();
    writeFailState(state);
  }

  function clearLoginFailures() {
    localStorage.removeItem(LOGIN_FAIL_KEY);
  }

  async function signIn(email, password) {
    const waitMs = loginThrottleMs();
    if (waitMs > 0) {
      await new Promise(function (resolve) {
        setTimeout(resolve, waitMs);
      });
    }
    const sb = getClient();
    const { data, error } = await sb.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (error) {
      recordLoginFailure();
      return { ok: false, error: error, waitMs: waitMs };
    }
    const profile = await fetchProfile(data.user.id);
    if (!isStaffProfile(profile)) {
      await sb.auth.signOut();
      recordLoginFailure();
      return {
        ok: false,
        error: { message: "This account does not have staff portal access." },
        waitMs: waitMs,
      };
    }
    clearLoginFailures();
    cachedProfile = profile;
    return { ok: true, session: data.session, user: data.user, profile: profile };
  }

  async function accessToken() {
    const { data } = await getClient().auth.getSession();
    return data.session ? data.session.access_token : null;
  }

  global.AdminAuth = {
    getClient: getClient,
    getSessionProfile: getSessionProfile,
    requireStaff: requireStaff,
    signIn: signIn,
    accessToken: accessToken,
    isStaffProfile: isStaffProfile,
    homeForRole: homeForRole,
    escapeHtml: escapeHtml,
    loginThrottleMs: loginThrottleMs,
    pageName: pageName,
  };
})(window);
