(function () {
  const esc = function (v) {
    return AdminAuth.escapeHtml(v);
  };

  function qs(sel) {
    return document.querySelector(sel);
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

  function requestListUrl(requestId) {
    const url = new URL(window.location.href);
    if (requestId) url.searchParams.set("request", requestId);
    else url.searchParams.delete("request");
    return url.pathname.split("/").pop() + url.search;
  }

  function renderList(requests) {
    const content = qs("#senior-content");
    if (!content) return;

    if (!requests.length) {
      setStatus(
        "No requests waiting",
        "There are currently no consultation requests that need action."
      );
      content.hidden = true;
      content.innerHTML = "";
      return;
    }

    setStatus(
      "Needs action",
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
          esc(requestListUrl(row.id)) +
          '">' +
          '<span class="senior-request-main"><strong>' +
          esc(row.parent_name) +
          "</strong> · age " +
          esc(String(row.parent_age)) +
          "</span>" +
          '<span class="senior-request-meta">' +
          esc(row.appointment_date_label || row.appointment_date) +
          " · " +
          esc(row.appointment_time_label || row.appointment_time) +
          " · " +
          esc(area) +
          "</span>" +
          '<span class="senior-request-reason">' +
          esc(row.reason_label || row.needs_senior_reason || "") +
          "</span></a>"
        );
      })
      .join("");

    content.hidden = false;
    content.innerHTML =
      '<div class="senior-request-list" role="list">' + rows + "</div>";
  }

  function renderDetail(detail) {
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
              esc(item.helper_name) +
              "</strong> — " +
              esc(item.status) +
              " (" +
              esc(item.source) +
              ")" +
              (item.responded_at
                ? " · responded " + esc(String(item.responded_at))
                : " · sent " + esc(String(item.sent_at))) +
              "</li>"
            );
          })
          .join("")
      : "<li>No offers yet.</li>";

    const helpersHtml = helpers
      .map(function (helper) {
        const warnings = (helper.warnings || [])
          .map(function (w) {
            return '<div class="senior-helper-warning">' + esc(w) + "</div>";
          })
          .join("");
        const unverified = helper.is_verified === false ||
          (helper.verification_status && helper.verification_status !== "verified");
        const busyClass =
          (helper.is_busy || helper.dropped_before ? " is-busy" : "") +
          (unverified ? " is-unverified" : "");
        const busyNote = helper.busy_label
          ? '<div class="senior-helper-busy">' + esc(helper.busy_label) + "</div>"
          : "";
        const unverifiedNote = unverified
          ? '<div class="senior-helper-warning">Not verified</div>'
          : "";
        const action =
          canAssign && helper.selectable
            ? '<button type="button" class="book-primary-btn senior-offer-btn" data-helper-id="' +
              esc(helper.id) +
              '">Send offer</button>'
            : "";

        return (
          '<div class="senior-helper-row' +
          busyClass +
          '"><div class="senior-helper-info"><strong>' +
          esc(helper.full_name) +
          '</strong><div class="senior-helper-meta">' +
          esc(helper.gender === "female" ? "Female" : "Male") +
          " · " +
          esc(helper.home_area || "Area n/a") +
          " · " +
          esc(helper.distance_label || "Distance n/a") +
          " · " +
          esc(String(helper.upcoming_assigned_jobs)) +
          " upcoming job" +
          (helper.upcoming_assigned_jobs === 1 ? "" : "s") +
          "</div>" +
          unverifiedNote +
          warnings +
          busyNote +
          '</div><div class="senior-helper-actions">' +
          action +
          "</div></div>"
        );
      })
      .join("");

    let assignedBlock = "";
    if (isAssigned && request.assigned_helper) {
      const confirmed = Boolean(request.helper_confirmed_at);
      assignedBlock =
        '<div class="senior-assigned-panel"><h2 class="book-subtitle">Assigned helper</h2><p><strong>' +
        esc(request.assigned_helper.full_name) +
        "</strong><br />Phone: " +
        esc(request.assigned_helper.phone) +
        "<br />Confirmation: " +
        (confirmed
          ? "Confirmed (" + esc(request.confirmed_by || "unknown") + ")"
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
      esc(requestListUrl()) +
      '">← All needs-action requests</a> · <a href="request.html?id=' +
      encodeURIComponent(request.id) +
      '">Full timeline</a></p>' +
      '<div class="senior-detail-grid"><div class="senior-detail-block">' +
      '<h2 class="book-subtitle">Request details</h2><p>' +
      "<strong>Patient:</strong> " +
      esc(request.parent_name) +
      " (age " +
      esc(String(request.parent_age)) +
      ")<br /><strong>Address:</strong> " +
      esc(request.address || "—") +
      "<br /><strong>Appointment:</strong> " +
      esc(request.appointment_date_label || request.appointment_date) +
      " at " +
      esc(request.appointment_time_label || request.appointment_time) +
      "<br /><strong>Doctor / Hospital:</strong> " +
      esc(request.doctor_hospital || "—") +
      "<br /><strong>Preference:</strong> " +
      esc(request.preference_label || request.helper_preference) +
      "<br /><strong>Reason:</strong> " +
      esc(request.reason_label || request.needs_senior_reason || "—") +
      "<br /><strong>Status:</strong> " +
      esc(request.status) +
      "</p>" +
      assignedBlock +
      '<h2 class="book-subtitle">Offer history</h2><ul class="senior-history-list">' +
      historyHtml +
      '</ul></div><div class="senior-detail-block"><h2 class="book-subtitle">Active helpers</h2>' +
      '<p class="book-field-hint">Sorted by best match. Busy or previously dropped helpers cannot be selected.</p>' +
      '<div class="senior-helper-list">' +
      (helpersHtml || "<p>No active helpers found.</p>") +
      "</div></div></div>";

    content.querySelectorAll(".senior-offer-btn").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const helperId = btn.getAttribute("data-helper-id");
        if (!helperId) return;
        btn.disabled = true;
        setMessage(qs("#senior-message"), "Sending offer…", "success");
        try {
          const result = await AdminApi.callStaffApi({
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
            await loadDetail(request.id);
          } else {
            setMessage(
              qs("#senior-message"),
              payload.message || payload.error || "Could not send offer.",
              "error"
            );
            btn.disabled = false;
          }
        } catch (_err) {
          setMessage(qs("#senior-message"), "Network error. Please try again.", "error");
          btn.disabled = false;
        }
      });
    });

    const confirmPhoneBtn = qs("#senior-confirm-phone-btn");
    if (confirmPhoneBtn) {
      confirmPhoneBtn.addEventListener("click", async function () {
        confirmPhoneBtn.disabled = true;
        setMessage(qs("#senior-message"), "Saving confirmation…", "success");
        try {
          const result = await AdminApi.callStaffApi({
            action: "confirm_by_phone",
            request_id: request.id,
          });
          const payload = result.payload || {};
          setMessage(
            qs("#senior-message"),
            payload.message || (payload.ok ? "Confirmed." : "Could not confirm."),
            payload.ok ? "success" : "error"
          );
          if (payload.ok) await loadDetail(request.id);
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
          const result = await AdminApi.callStaffApi({
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
          if (payload.ok) await loadDetail(request.id);
          else unableBtn.disabled = false;
        } catch (_err) {
          setMessage(qs("#senior-message"), "Network error.", "error");
          unableBtn.disabled = false;
        }
      });
    }
  }

  async function loadList() {
    const result = await AdminApi.callStaffApi({ action: "list" });
    if (result.response.status === 401 || !result.payload.ok) {
      setStatus("Access denied", "Staff session required.");
      setMessage(
        qs("#senior-message"),
        result.payload.error || "Unable to load needs-action list.",
        "error"
      );
      qs("#senior-content").hidden = true;
      return;
    }
    renderList(result.payload.requests || []);
  }

  async function loadDetail(requestId) {
    const result = await AdminApi.callStaffApi({
      action: "detail",
      request_id: requestId,
    });
    if (result.response.status === 401 || result.payload.ok === false) {
      setStatus("Unable to load", "This request could not be opened.");
      setMessage(
        qs("#senior-message"),
        result.payload.error || "Unable to load this request.",
        "error"
      );
      qs("#senior-content").hidden = true;
      return;
    }
    renderDetail(result.payload);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const auth = await AdminAuth.requireStaff();
    if (!auth) return;
    const params = new URLSearchParams(window.location.search);
    const requestId = String(params.get("request") || "").trim();
    try {
      if (requestId) await loadDetail(requestId);
      else await loadList();
    } catch (_err) {
      setStatus("Unable to load", "Please try again in a moment.");
      setMessage(qs("#senior-message"), "Network error while loading data.", "error");
    }
  });
})();
