(function () {
  const FIELDS = [
    { key: "wave_size", label: "Wave size", type: "number" },
    { key: "wave_gap_minutes", label: "Wave gap (minutes)", type: "number" },
    { key: "offer_window_hours", label: "Offer window (hours)", type: "number" },
    { key: "night_start", label: "Night start (HH:MM)", type: "text" },
    { key: "night_end", label: "Night end (HH:MM)", type: "text" },
    {
      key: "engaged_window_hours",
      label: "Engaged window (hours)",
      type: "number",
    },
    {
      key: "senior_offer_expiry_minutes",
      label: "Senior offer expiry (minutes)",
      type: "number",
    },
    {
      key: "urgent_offer_expiry_minutes",
      label: "Urgent offer expiry (minutes)",
      type: "number",
    },
  ];

  function setMessage(text, type) {
    const el = document.querySelector("#settings-message");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = text
      ? "book-form-message book-form-message--" + type + " is-visible"
      : "book-form-message";
  }

  async function loadSettings() {
    const sb = AdminAuth.getClient();
    const { data, error } = await sb.from("app_settings").select("key, value, description");
    if (error) throw error;
    const map = {};
    (data || []).forEach(function (row) {
      map[row.key] = row;
    });

    const form = document.querySelector("#settings-form");
    form.innerHTML = FIELDS.map(function (field) {
      const row = map[field.key] || {};
      return (
        "<label>" +
        AdminAuth.escapeHtml(field.label) +
        (row.description
          ? '<span class="admin-muted">' +
            AdminAuth.escapeHtml(row.description) +
            "</span>"
          : "") +
        '<input name="' +
        field.key +
        '" type="' +
        field.type +
        '" value="' +
        AdminAuth.escapeHtml(row.value || "") +
        '" required />' +
        "</label>"
      );
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const auth = await AdminAuth.requireStaff({ superAdminOnly: true });
    if (!auth) return;

    document
      .querySelector("#settings-form")
      .addEventListener("submit", async function (event) {
        event.preventDefault();
        const sb = AdminAuth.getClient();
        const form = event.currentTarget;
        setMessage("Saving…", "success");
        try {
          for (let i = 0; i < FIELDS.length; i++) {
            const field = FIELDS[i];
            const value = String(form.elements[field.key].value || "").trim();
            const { error } = await sb
              .from("app_settings")
              .update({ value: value })
              .eq("key", field.key);
            if (error) throw error;
          }
          setMessage("Settings saved. Dispatcher will use the new values on the next run.", "success");
        } catch (err) {
          setMessage(err.message || "Could not save settings.", "error");
        }
      });

    try {
      await loadSettings();
    } catch (err) {
      setMessage(err.message || "Unable to load settings.", "error");
    }
  });
})();
