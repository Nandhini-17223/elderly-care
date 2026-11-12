(function () {
  const AdminAuth = window.AdminAuth;
  const AdminApi = window.AdminApi;
  const esc = AdminAuth.escapeHtml;

  function qs(sel) {
    return document.querySelector(sel);
  }

  function setMessage(el, text, kind) {
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.className = "book-form-message";
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className =
      "book-form-message" + (kind === "error" ? " is-error" : " is-success");
  }

  function statusLabel(status) {
    const map = {
      pending: "Pending",
      verified: "Verified",
      rejected: "Rejected",
      expired: "Expired",
    };
    return map[status] || status || "—";
  }

  async function loadHelpers() {
    const tbody = qs("#helpers-rows");
    setMessage(qs("#helpers-message"), "");
    tbody.innerHTML =
      '<tr><td colspan="7" class="admin-empty">Loading…</td></tr>';

    const result = await AdminApi.callHelperAdmin({
      action: "list",
      search: qs("#filter-search").value.trim(),
      verification_status: qs("#filter-verification").value,
      is_active: qs("#filter-active").value,
      gender: qs("#filter-gender").value,
      area: qs("#filter-area").value.trim(),
    });
    const payload = result.payload || {};
    if (!payload.ok) {
      setMessage(
        qs("#helpers-message"),
        payload.error || "Could not load helpers.",
        "error"
      );
      tbody.innerHTML =
        '<tr><td colspan="7" class="admin-empty">Unable to load helpers.</td></tr>';
      return;
    }

    const rows = payload.helpers || [];
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="admin-empty">No helpers match these filters.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (h) {
        const dl =
          h.can_drive && h.dl_expiry
            ? AdminApi.formatIstDate(h.dl_expiry)
            : h.can_drive
              ? "—"
              : "n/a";
        return (
          "<tr>" +
          '<td><a href="helper.html?id=' +
          encodeURIComponent(h.id) +
          '">' +
          esc(h.full_name) +
          "</a></td>" +
          "<td>" +
          esc(h.gender === "female" ? "Female" : "Male") +
          "</td>" +
          "<td>" +
          esc(h.home_area || "—") +
          "</td>" +
          "<td>" +
          esc(statusLabel(h.verification_status)) +
          "</td>" +
          "<td>" +
          (h.is_active ? "Yes" : "No") +
          "</td>" +
          "<td>" +
          esc(String(h.upcoming_assigned_jobs ?? 0)) +
          "</td>" +
          "<td>" +
          esc(dl) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function init() {
    const session = await AdminAuth.requireStaff();
    if (!session) return;
    qs("#filter-apply").addEventListener("click", loadHelpers);
    ["#filter-search", "#filter-area"].forEach(function (sel) {
      qs(sel).addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          loadHelpers();
        }
      });
    });
    await loadHelpers();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
