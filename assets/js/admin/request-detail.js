(function () {
  const esc = function (v) {
    return AdminAuth.escapeHtml(v);
  };

  function setMessage(text, type) {
    const el = document.querySelector("#detail-message");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = text
      ? "book-form-message book-form-message--" + type + " is-visible"
      : "book-form-message";
  }

  function pushEvent(events, at, label, detail) {
    if (!at) return;
    events.push({ at: at, label: label, detail: detail || "" });
  }

  async function loadDetail(id) {
    const sb = AdminAuth.getClient();
    const { data: request, error } = await sb
      .from("consultation_requests")
      .select(
        "id, status, parent_name, parent_age, address_line1, street, area, landmark, city, pincode, appointment_date, appointment_time, doctor_hospital, helper_preference, needs_senior_reason, booking_person_name, relationship, email, phone_country_code, phone, created_at, assigned_helper_id, assigned_at, senior_notified_at, guardian_arranging_sent_at, helper_confirmed_at, confirmed_by, helper_dropped_at, previous_helper_ids, reminder_12h_sent_at, reminder_6h_sent_at, helpers:assigned_helper_id(full_name, phone, email)"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!request) throw new Error("Request not found");

    const { data: offers, error: offersError } = await sb
      .from("helper_offers")
      .select(
        "id, helper_id, status, source, wave_number, sent_at, responded_at, distance_km, helpers(full_name)"
      )
      .eq("request_id", id)
      .order("sent_at", { ascending: true });
    if (offersError) throw offersError;

    document.querySelector("#detail-title").textContent = request.parent_name;
    document.querySelector("#detail-sub").textContent =
      "Status: " +
      request.status +
      " · " +
      AdminApi.formatIstDate(request.appointment_date) +
      " " +
      AdminApi.formatIstTime(request.appointment_time);
    document.querySelector("#link-needs").href =
      "needs-action.html?request=" + encodeURIComponent(request.id);

    const address = [
      request.address_line1,
      request.street,
      request.area,
      request.landmark ? "Landmark: " + request.landmark : null,
      request.city,
      request.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    const events = [];
    pushEvent(events, request.created_at, "Request created", request.status);
    (offers || []).forEach(function (offer) {
      pushEvent(
        events,
        offer.sent_at,
        "Offer sent (" + offer.source + ", wave " + offer.wave_number + ")",
        (offer.helpers && offer.helpers.full_name) || offer.helper_id
      );
      if (offer.status === "accepted") {
        pushEvent(
          events,
          offer.responded_at || offer.sent_at,
          "Offer accepted",
          (offer.helpers && offer.helpers.full_name) || ""
        );
      } else if (offer.status === "declined") {
        pushEvent(
          events,
          offer.responded_at || offer.sent_at,
          "Offer declined",
          (offer.helpers && offer.helpers.full_name) || ""
        );
      } else if (offer.status === "expired" || offer.status === "withdrawn") {
        pushEvent(
          events,
          offer.responded_at || offer.sent_at,
          "Offer " + offer.status,
          (offer.helpers && offer.helpers.full_name) || ""
        );
      }
    });
    pushEvent(events, request.senior_notified_at, "Senior notified", request.needs_senior_reason);
    pushEvent(events, request.assigned_at, "Helper assigned", request.helpers && request.helpers.full_name);
    pushEvent(events, request.reminder_12h_sent_at, "12h reminder sent");
    pushEvent(events, request.reminder_6h_sent_at, "6h reminder sent");
    pushEvent(
      events,
      request.helper_confirmed_at,
      "Attendance confirmed",
      request.confirmed_by || ""
    );
    pushEvent(events, request.helper_dropped_at, "Helper drop-out / release");

    events.sort(function (a, b) {
      return new Date(a.at).getTime() - new Date(b.at).getTime();
    });

    const timeline = events.length
      ? events
          .map(function (ev) {
            return (
              "<li><strong>" +
              esc(ev.label) +
              '</strong><div class="admin-muted">' +
              esc(AdminApi.formatIstDateTime(ev.at)) +
              (ev.detail ? " · " + esc(ev.detail) : "") +
              "</div></li>"
            );
          })
          .join("")
      : "<li>No timeline events yet.</li>";

    document.querySelector("#detail-body").innerHTML =
      "<p><strong>Patient:</strong> " +
      esc(request.parent_name) +
      " (age " +
      esc(String(request.parent_age)) +
      ")<br /><strong>Booked by:</strong> " +
      esc(request.booking_person_name) +
      " (" +
      esc(request.relationship) +
      ")<br /><strong>Phone:</strong> " +
      esc((request.phone_country_code || "") + " " + (request.phone || "")) +
      "<br /><strong>Email:</strong> " +
      esc(request.email || "—") +
      "<br /><strong>Address:</strong> " +
      esc(address || "—") +
      "<br /><strong>Doctor / Hospital:</strong> " +
      esc(request.doctor_hospital || "—") +
      "<br /><strong>Helper preference:</strong> " +
      esc(request.helper_preference || "—") +
      "<br /><strong>Assigned helper:</strong> " +
      esc((request.helpers && request.helpers.full_name) || "—") +
      "</p>" +
      '<h2 class="admin-section-title">Timeline</h2>' +
      '<ul class="admin-timeline">' +
      timeline +
      "</ul>" +
      '<div class="admin-actions-row">' +
      '<a class="book-primary-btn" href="needs-action.html?request=' +
      encodeURIComponent(request.id) +
      '">Open in Needs action</a>' +
      "</div>";
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const auth = await AdminAuth.requireStaff();
    if (!auth) return;
    const id = String(
      new URLSearchParams(window.location.search).get("id") || ""
    ).trim();
    if (!id) {
      setMessage("Missing request id.", "error");
      return;
    }
    try {
      await loadDetail(id);
    } catch (err) {
      setMessage(err.message || "Unable to load request.", "error");
    }
  });
})();
