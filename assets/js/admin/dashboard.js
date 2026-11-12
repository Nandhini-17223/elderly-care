(function () {
  const esc = function (v) {
    return AdminAuth.escapeHtml(v);
  };

  function setMessage(text, type) {
    const el = document.querySelector("#dash-message");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = text
      ? "book-form-message book-form-message--" + type + " is-visible"
      : "book-form-message";
  }

  async function loadDashboard() {
    const sb = AdminAuth.getClient();
    const today = AdminApi.todayIstDateString();
    const end = AdminApi.addDaysIst(today, 7);

    const [
      { count: needsCount, error: needsErr },
      { count: offeredCount, error: offeredErr },
      { count: assignedCount, error: assignedErr },
      { count: cancelledCount, error: cancelledErr },
      { data: visits, error: visitsErr },
    ] = await Promise.all([
      sb
        .from("consultation_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["needs_senior", "senior_offered"]),
      sb
        .from("consultation_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "offered"),
      sb
        .from("consultation_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "assigned"),
      sb
        .from("consultation_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled"),
      sb
        .from("consultation_requests")
        .select(
          "id, ref_number, parent_name, area, pincode, appointment_date, appointment_time, status, helper_confirmed_at, assigned_helper_id, helpers:assigned_helper_id(full_name)"
        )
        .gte("appointment_date", today)
        .lte("appointment_date", end)
        .neq("status", "cancelled")
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true }),
    ]);

    if (needsErr || offeredErr || assignedErr || cancelledErr || visitsErr) {
      throw needsErr || offeredErr || assignedErr || cancelledErr || visitsErr;
    }

    document.querySelector("#stat-needs").textContent = String(needsCount || 0);
    document.querySelector("#stat-offered").textContent = String(offeredCount || 0);
    document.querySelector("#stat-assigned").textContent = String(assignedCount || 0);
    document.querySelector("#stat-cancelled").textContent = String(
      cancelledCount || 0
    );

    const tbody = document.querySelector("#dash-rows");
    if (!visits || !visits.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="admin-empty">No visits in the next 7 days.</td></tr>';
      return;
    }

    tbody.innerHTML = visits
      .map(function (row) {
        const conf = AdminApi.confirmationLabel(row);
        const helperName =
          (row.helpers && row.helpers.full_name) ||
          (row.status === "needs_senior" || row.status === "senior_offered"
            ? "Unassigned"
            : "—");
        const area = [row.area, row.pincode].filter(Boolean).join(" · ") || "—";
        return (
          "<tr>" +
          "<td><strong>" +
          esc(row.ref_number || AdminApi.firstName(row.parent_name)) +
          "</strong><div class='admin-muted'>" +
          esc(AdminApi.firstName(row.parent_name)) +
          "</div></td>" +
          "<td>" +
          esc(AdminApi.formatIstDate(row.appointment_date)) +
          "<br /><span class='admin-muted'>" +
          esc(AdminApi.formatIstTime(row.appointment_time)) +
          "</span></td>" +
          "<td>" +
          esc(area) +
          "</td>" +
          "<td>" +
          esc(helperName) +
          "</td>" +
          "<td><span class='admin-badge'>" +
          esc(conf.icon + " " + conf.text) +
          "</span></td>" +
          '<td><a href="request.html?id=' +
          encodeURIComponent(row.id) +
          '">Open</a></td>' +
          "</tr>"
        );
      })
      .join("");
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const auth = await AdminAuth.requireStaff();
    if (!auth) return;
    try {
      await loadDashboard();
    } catch (err) {
      setMessage(err.message || "Unable to load dashboard.", "error");
      document.querySelector("#dash-rows").innerHTML =
        '<tr><td colspan="6" class="admin-empty">Could not load visits.</td></tr>';
    }
  });
})();
