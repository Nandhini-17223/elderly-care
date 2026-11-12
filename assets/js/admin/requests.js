(function () {
  const esc = function (v) {
    return AdminAuth.escapeHtml(v);
  };

  function setMessage(text, type) {
    const el = document.querySelector("#req-message");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = text
      ? "book-form-message book-form-message--" + type + " is-visible"
      : "book-form-message";
  }

  async function searchRequests() {
    const sb = AdminAuth.getClient();
    const q = String(document.querySelector("#filter-q").value || "").trim();
    const status = String(document.querySelector("#filter-status").value || "").trim();
    const from = String(document.querySelector("#filter-from").value || "").trim();
    const to = String(document.querySelector("#filter-to").value || "").trim();

    let query = sb
      .from("consultation_requests")
      .select(
        "id, parent_name, phone, phone_country_code, pincode, appointment_date, appointment_time, status, created_at"
      )
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false })
      .limit(100);

    if (status) query = query.eq("status", status);
    if (from) query = query.gte("appointment_date", from);
    if (to) query = query.lte("appointment_date", to);

    const { data, error } = await query;
    if (error) throw error;

    let rows = data || [];
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(function (row) {
        const hay = [
          row.parent_name,
          row.phone,
          row.phone_country_code,
          row.pincode,
          (row.phone_country_code || "") + " " + (row.phone || ""),
        ]
          .join(" ")
          .toLowerCase();
        return hay.indexOf(needle) !== -1;
      });
    }

    const tbody = document.querySelector("#req-rows");
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="admin-empty">No matching requests.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(function (row) {
        return (
          "<tr>" +
          "<td><strong>" +
          esc(row.parent_name) +
          "</strong></td>" +
          "<td>" +
          esc((row.phone_country_code || "") + " " + (row.phone || "")) +
          "</td>" +
          "<td>" +
          esc(AdminApi.formatIstDate(row.appointment_date)) +
          " " +
          esc(AdminApi.formatIstTime(row.appointment_time)) +
          "</td>" +
          "<td>" +
          esc(row.pincode || "—") +
          "</td>" +
          "<td>" +
          esc(row.status) +
          "</td>" +
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
    document.querySelector("#req-filters").addEventListener("submit", async function (e) {
      e.preventDefault();
      try {
        await searchRequests();
      } catch (err) {
        setMessage(err.message || "Search failed.", "error");
      }
    });
    try {
      await searchRequests();
    } catch (err) {
      setMessage(err.message || "Unable to load requests.", "error");
    }
  });
})();
