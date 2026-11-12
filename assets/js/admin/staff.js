(function () {
  const esc = function (v) {
    return AdminAuth.escapeHtml(v);
  };

  function setMessage(text, type) {
    const el = document.querySelector("#staff-message");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = text
      ? "book-form-message book-form-message--" + type + " is-visible"
      : "book-form-message";
  }

  async function loadProfiles() {
    const sb = AdminAuth.getClient();
    const { data, error } = await sb
      .from("profiles")
      .select("user_id, full_name, role, is_active, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const tbody = document.querySelector("#staff-rows");
    if (!data || !data.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="admin-empty">No profiles found.</td></tr>';
      return;
    }

    tbody.innerHTML = data
      .map(function (row) {
        const toggleLabel = row.is_active ? "Deactivate" : "Reactivate";
        const canToggle = row.role !== "super_admin";
        return (
          "<tr>" +
          "<td><strong>" +
          esc(row.full_name) +
          '</strong><div class="admin-muted">' +
          esc(String(row.user_id).slice(0, 8)) +
          "</div></td>" +
          "<td>" +
          esc(row.role) +
          "</td>" +
          "<td>" +
          (row.is_active ? "Yes" : "No") +
          "</td>" +
          "<td>" +
          esc(AdminApi.formatIstDateTime(row.created_at)) +
          "</td>" +
          "<td>" +
          (canToggle
            ? '<button type="button" class="book-secondary-btn" data-toggle-user="' +
              esc(row.user_id) +
              '" data-active="' +
              (row.is_active ? "1" : "0") +
              '">' +
              toggleLabel +
              "</button>"
            : "—") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("[data-toggle-user]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const userId = btn.getAttribute("data-toggle-user");
        const currentlyActive = btn.getAttribute("data-active") === "1";
        btn.disabled = true;
        const result = await AdminApi.callStaffAccounts({
          action: currentlyActive ? "deactivate" : "reactivate",
          user_id: userId,
        });
        if (!result.payload.ok) {
          setMessage(
            result.payload.message || result.payload.error || "Update failed.",
            "error"
          );
          btn.disabled = false;
          return;
        }
        setMessage(result.payload.message || "Updated.", "success");
        await loadProfiles();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const auth = await AdminAuth.requireStaff({ superAdminOnly: true });
    if (!auth) return;

    document
      .querySelector("#create-manager-form")
      .addEventListener("submit", async function (event) {
        event.preventDefault();
        const fullName = String(document.querySelector("#mgr-name").value || "").trim();
        const email = String(document.querySelector("#mgr-email").value || "").trim();
        const password = String(document.querySelector("#mgr-password").value || "");
        if (!fullName || !email || password.length < 8) {
          setMessage("Name, email, and a password of at least 8 characters are required.", "error");
          return;
        }
        setMessage("Creating manager…", "success");
        const result = await AdminApi.callStaffAccounts({
          action: "create_manager",
          full_name: fullName,
          email: email,
          password: password,
        });
        if (!result.payload.ok) {
          setMessage(
            result.payload.message || result.payload.error || "Could not create manager.",
            "error"
          );
          return;
        }
        setMessage(result.payload.message || "Manager created.", "success");
        document.querySelector("#create-manager-form").reset();
        await loadProfiles();
      });

    try {
      await loadProfiles();
    } catch (err) {
      setMessage(err.message || "Unable to load staff accounts.", "error");
    }
  });
})();
