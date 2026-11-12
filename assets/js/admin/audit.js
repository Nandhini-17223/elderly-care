(function () {
  const esc = function (v) {
    return AdminAuth.escapeHtml(v);
  };

  function setMessage(text, type) {
    const el = document.querySelector("#audit-message");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = text
      ? "book-form-message book-form-message--" + type + " is-visible"
      : "book-form-message";
  }

  async function loadAudit() {
    const sb = AdminAuth.getClient();
    const { data, error } = await sb
      .from("audit_log")
      .select("id, actor_user_id, actor_role, action, entity, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const tbody = document.querySelector("#audit-rows");
    if (!data || !data.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="admin-empty">No audit entries yet.</td></tr>';
      return;
    }

    tbody.innerHTML = data
      .map(function (row) {
        return (
          "<tr>" +
          "<td>" +
          esc(AdminApi.formatIstDateTime(row.created_at)) +
          "</td>" +
          "<td>" +
          esc(row.actor_role || "—") +
          '<div class="admin-muted">' +
          esc(String(row.actor_user_id || "").slice(0, 8)) +
          "</div></td>" +
          "<td>" +
          esc(row.action) +
          "</td>" +
          "<td>" +
          esc(row.entity) +
          '<div class="admin-muted">' +
          esc(row.entity_id || "") +
          "</div></td>" +
          "<td><code>" +
          esc(JSON.stringify(row.details || {})) +
          "</code></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const auth = await AdminAuth.requireStaff({ superAdminOnly: true });
    if (!auth) return;
    try {
      await loadAudit();
    } catch (err) {
      setMessage(err.message || "Unable to load audit log.", "error");
    }
  });
})();
