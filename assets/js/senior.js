(function () {
  const SUPABASE_URL = "https://vzmhcqhcvflylmobpvap.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw";

  function qs(sel) {
    return document.querySelector(sel);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      key: String(params.get("key") || "").trim(),
      request: String(params.get("request") || "").trim(),
    };
  }

  function setMessage(el, text, type) {
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className =
      "book-form-message book-form-message--" + type + " is-visible";
  }

  function setStatus(title, detail) {
    const titleEl = qs("#senior-title");
    const detailEl = qs("#senior-detail");
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
  }

  async function callSeniorApi(body) {
    const response = await fetch(SUPABASE_URL + "/functions/v1/senior-api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(function () {
      return {};
    });
    return { response: response, payload: payload };
  }

  function requestListUrl(key, requestId) {
    const url = new URL(window.location.href);
    url.searchParams.set("key", key);
    if (requestId) url.searchParams.set("request", requestId);
    else url.searchParams.delete("request");
    return url.pathname + url.search;
  }

  function renderList(key, requests) {
    const content = qs("#senior-content");
    if (!content) return;

    if (!requests.length) {
      setStatus(
        "No requests waiting",
        "There are currently no consultation requests in needs_senior."
      );
      content.hidden = true;
      content.innerHTML = "";
      return;
    }

    setStatus(
      "Needs senior attention",
      requests.length +
        " request" +
        (requests.length === 1 ? "" : "s") +
        " waiting for a helper (oldest appointment first)."
    );

    const rows = requests
      .map(function (row) {
        const area = [row.area, row.pincode].filter(Boolean).join(" · ") || "—";
        return (
          '<a class="senior-request-row" href="' +
          escapeHtml(requestListUrl(key, row.id)) +
          '">' +
          '<span class="senior-request-main">' +
          "<strong>" +
          escapeHtml(row.parent_name) +
          "</strong> · age " +
          escapeHtml(String(row.parent_age)) +
          "</span>" +
          '<span class="senior-request-meta">' +
          escapeHtml(row.appointment_date_label || row.appointment_date) +
          " · " +
          escapeHtml(row.appointment_time_label || row.appointment_time) +
          " · " +
          escapeHtml(area) +
          "</span>" +
          '<span class="senior-request-reason">' +
          escapeHtml(row.reason_label || row.needs_senior_reason || "") +
          "</span>" +
          "</a>"
        );
      })
      .join("");

    content.hidden = false;
    content.innerHTML =
      '<div class="senior-request-list" role="list">' + rows + "</div>";
  }

  function renderDetail(key, detail) {
    const content = qs("#senior-content");
    if (!content) return;
    const request = detail.request;
    const helpers = detail.helpers || [];
    const history = detail.offer_history || [];
    const isAssigned = request.status === "assigned";
    const canAssign =
      request.status === "needs_senior" || request.status === "senior_offered";

    setStatus(
      request.parent_name,
      "Age " +
        request.parent_age +
        " · " +
        (request.appointment_date_label || request.appointment_date) +
        " at " +
        (request.appointment_time_label || request.appointment_time)
    );

    const historyHtml = history.length
      ? history
          .map(function (item) {
            return (
              "<li><strong>" +
              escapeHtml(item.helper_name) +
              "</strong> — " +
              escapeHtml(item.status) +
              " (" +
              escapeHtml(item.source) +
              ")" +
              (item.responded_at
                ? " · responded " + escapeHtml(String(item.responded_at))
                : " · sent " + escapeHtml(String(item.sent_at))) +
              "</li>"
            );
          })
          .join("")
      : "<li>No offers yet.</li>";

    const helpersHtml = helpers
      .map(function (helper) {
        const warnings = (helper.warnings || [])
          .map(function (w) {
            return '<div class="senior-helper-warning">' + escapeHtml(w) + "</div>";
          })
          .join("");
        const busyClass = helper.is_busy || helper.dropped_before ? " is-busy" : "";
        const busyNote = helper.busy_label
          ? '<div class="senior-helper-busy">' +
            escapeHtml(helper.busy_label) +
            "</div>"
          : "";
        const action =
          canAssign && helper.selectable
            ? '<button type="button" class="book-primary-btn senior-offer-btn" data-helper-id="' +
              escapeHtml(helper.id) +
              '">Send offer</button>'
            : "";

        return (
          '<div class="senior-helper-row' +
          busyClass +
          '" data-helper-row="' +
          escapeHtml(helper.id) +
          '">' +
          '<div class="senior-helper-info">' +
          "<strong>" +
          escapeHtml(helper.full_name) +
          "</strong>" +
          '<div class="senior-helper-meta">' +
          escapeHtml(helper.gender === "female" ? "Female" : "Male") +
          " · " +
          escapeHtml(helper.home_area || "Area n/a") +
          " · " +
          escapeHtml(helper.distance_label || "Distance n/a") +
          " · " +
          escapeHtml(String(helper.upcoming_assigned_jobs)) +
          " upcoming job" +
          (helper.upcoming_assigned_jobs === 1 ? "" : "s") +
          "</div>" +
          warnings +
          busyNote +
          "</div>" +
          '<div class="senior-helper-actions">' +
          action +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    let assignedBlock = "";
    if (isAssigned && request.assigned_helper) {
      const confirmed = Boolean(request.helper_confirmed_at);
      assignedBlock =
        '<div class="senior-assigned-panel">' +
        '<h2 class="book-subtitle">Assigned helper</h2>' +
        "<p><strong>" +
        escapeHtml(request.assigned_helper.full_name) +
        "</strong><br />Phone: " +
        escapeHtml(request.assigned_helper.phone) +
        "<br />Confirmation: " +
        (confirmed
          ? "Confirmed (" + escapeHtml(request.confirmed_by || "unknown") + ")"
          : "Not confirmed yet") +
        "</p>" +
        (confirmed
          ? ""
          : '<div class="senior-assigned-actions">' +
            '<button type="button" class="book-primary-btn" id="senior-confirm-phone-btn">Helper confirmed by phone</button>' +
            '<button type="button" class="book-secondary-btn" id="senior-unable-reassign-btn">Helper unable – reassign</button>' +
            "</div>") +
        "</div>";
    }

    content.hidden = false;
    content.innerHTML =
      '<p class="senior-back"><a href="' +
      escapeHtml(requestListUrl(key)) +
      '">← All needs_senior requests</a></p>' +
      '<div class="senior-detail-grid">' +
      '<div class="senior-detail-block">' +
      '<h2 class="book-subtitle">Request details</h2>' +
      "<p>" +
      "<strong>Patient:</strong> " +
      escapeHtml(request.parent_name) +
      " (age " +
      escapeHtml(String(request.parent_age)) +
      ")<br />" +
      "<strong>Address:</strong> " +
      escapeHtml(request.address || "—") +
      "<br />" +
      "<strong>Appointment:</strong> " +
      escapeHtml(request.appointment_date_label || request.appointment_date) +
      " at " +
      escapeHtml(request.appointment_time_label || request.appointment_time) +
      "<br />" +
      "<strong>Doctor / Hospital:</strong> " +
      escapeHtml(request.doctor_hospital || "—") +
      "<br />" +
      "<strong>Preference:</strong> " +
      escapeHtml(request.preference_label || request.helper_preference) +
      "<br />" +
      "<strong>Reason:</strong> " +
      escapeHtml(request.reason_label || request.needs_senior_reason || "—") +
      "<br />" +
      "<strong>Status:</strong> " +
      escapeHtml(request.status) +
      "</p>" +
      assignedBlock +
      '<h2 class="book-subtitle">Offer history</h2>' +
      '<ul class="senior-history-list">' +
      historyHtml +
      "</ul>" +
      "</div>" +
      '<div class="senior-detail-block">' +
      '<h2 class="book-subtitle">Active helpers</h2>' +
      '<p class="book-field-hint">Sorted by best match. Busy or previously dropped helpers cannot be selected.</p>' +
      '<div class="senior-helper-list">' +
      (helpersHtml || "<p>No active helpers found.</p>") +
      "</div>" +
      "</div>" +
      "</div>";

    content.querySelectorAll(".senior-offer-btn").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const helperId = btn.getAttribute("data-helper-id");
        if (!helperId) return;
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        setMessage(qs("#senior-message"), "Sending offer…", "success");

        try {
          const result = await callSeniorApi({
            key: key,
            action: "send_offer",
            request_id: request.id,
            helper_id: helperId,
          });
          const payload = result.payload || {};
          if (payload.ok) {
            setMessage(
              qs("#senior-message"),
              payload.message || "Offer sent.",
              "success"
            );
            await loadDetail(key, request.id);
          } else {
            setMessage(
              qs("#senior-message"),
              payload.message || payload.error || "Could not send offer.",
              "error"
            );
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
          }
        } catch (_err) {
          setMessage(
            qs("#senior-message"),
            "Network error. Please try again.",
            "error"
          );
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
        }
      });
    });

    const confirmPhoneBtn = qs("#senior-confirm-phone-btn");
    if (confirmPhoneBtn) {
      confirmPhoneBtn.addEventListener("click", async function () {
        confirmPhoneBtn.disabled = true;
        setMessage(qs("#senior-message"), "Saving confirmation…", "success");
        try {
          const result = await callSeniorApi({
            key: key,
            action: "confirm_by_phone",
            request_id: request.id,
          });
          const payload = result.payload || {};
          setMessage(
            qs("#senior-message"),
            payload.message ||
              (payload.ok ? "Confirmed." : "Could not confirm."),
            payload.ok ? "success" : "error"
          );
          if (payload.ok) await loadDetail(key, request.id);
          else confirmPhoneBtn.disabled = false;
        } catch (_err) {
          setMessage(qs("#senior-message"), "Network error.", "error");
          confirmPhoneBtn.disabled = false;
        }
      });
    }

    const unableBtn = qs("#senior-unable-reassign-btn");
    if (unableBtn) {
      unableBtn.addEventListener("click", async function () {
        unableBtn.disabled = true;
        setMessage(
          qs("#senior-message"),
          "Releasing helper and notifying family…",
          "success"
        );
        try {
          const result = await callSeniorApi({
            key: key,
            action: "helper_unable_reassign",
            request_id: request.id,
          });
          const payload = result.payload || {};
          setMessage(
            qs("#senior-message"),
            payload.message ||
              (payload.ok ? "Helper released." : "Could not reassign."),
            payload.ok ? "success" : "error"
          );
          if (payload.ok) await loadDetail(key, request.id);
          else unableBtn.disabled = false;
        } catch (_err) {
          setMessage(qs("#senior-message"), "Network error.", "error");
          unableBtn.disabled = false;
        }
      });
    }
  }

  async function loadList(key) {
    const result = await callSeniorApi({ key: key, action: "list" });
    if (result.response.status === 401 || !result.payload.ok) {
      setStatus("Access denied", "This senior link is missing or invalid.");
      setMessage(
        qs("#senior-message"),
        "Provide a valid key to view senior requests.",
        "error"
      );
      qs("#senior-content").hidden = true;
      return;
    }
    renderList(key, result.payload.requests || []);
  }

  async function loadDetail(key, requestId) {
    const result = await callSeniorApi({
      key: key,
      action: "detail",
      request_id: requestId,
    });
    if (result.response.status === 401 || result.payload.ok === false) {
      setStatus("Access denied", "This senior link is missing or invalid.");
      setMessage(
        qs("#senior-message"),
        result.payload.error || "Unable to load this request.",
        "error"
      );
      qs("#senior-content").hidden = true;
      return;
    }
    renderDetail(key, result.payload);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const params = getParams();
    const messageEl = qs("#senior-message");

    if (!params.key) {
      setStatus("Access denied", "A senior access key is required.");
      setMessage(
        messageEl,
        "Open this page from a senior email link that includes your key.",
        "error"
      );
      return;
    }

    try {
      if (params.request) {
        await loadDetail(params.key, params.request);
      } else {
        await loadList(params.key);
      }
    } catch (_err) {
      setStatus("Unable to load", "Please try again in a moment.");
      setMessage(messageEl, "Network error while loading senior data.", "error");
    }
  });
})();
