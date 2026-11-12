(function () {
  const SUPABASE_URL = "https://vzmhcqhcvflylmobpvap.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw";

  const OFFER_ACTIONS = { accept: true, decline: true };
  const ASSIGNMENT_ACTIONS = {
    confirm_attendance: true,
    cant_make_it: true,
  };

  const ON_SCREEN = {
    accept_confirm: {
      title: "Accept this visit?",
      message:
        "{{appointment_date_short}} · {{appointment_time}} · {{area}}. Tap Confirm to take this visit.",
      button: "Confirm",
    },
    declined_confirm: {
      title: "Decline this visit?",
      message: "Tap Confirm to decline. We'll offer it to another helper.",
      button: "Confirm",
    },
    accepted: {
      title: "This visit is yours!",
      message:
        "We've emailed you the full details. Thank you, {{helper_first_name}}.",
    },
    already_taken: {
      title: "Already taken",
      message:
        "Another helper accepted this visit first. Thank you for responding quickly.",
    },
    helper_engaged: {
      title: "You're already booked",
      message:
        "You have another visit around this time, so we can't assign this one to you.",
    },
    declined: {
      title: "Thanks for letting us know",
      message: "We've offered this visit to another helper.",
    },
    confirmed: {
      title: "See you there!",
      message: "Thanks for confirming. The family is counting on you.",
    },
    cant_make_it_confirm: {
      title: "Can't make this visit?",
      message:
        "Tell us why (optional), then tap Confirm. We'll arrange a replacement.",
      button: "Confirm",
    },
    cant_make_it_done: {
      title: "Thanks for telling us",
      message: "Our care team will arrange a replacement.",
    },
    link_inactive: {
      title: "This link is no longer active",
      message:
        "The visit may have been assigned, cancelled or already passed. Please contact your manager if you need help.",
    },
  };

  function qs(sel) {
    return document.querySelector(sel);
  }

  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      token: String(params.get("token") || "").trim(),
      action: String(params.get("action") || "").trim().toLowerCase(),
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
    const titleEl = qs("#respond-title");
    const detailEl = qs("#respond-detail");
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
  }

  function endpointFor(action) {
    if (OFFER_ACTIONS[action]) return "/functions/v1/offer-respond";
    return "/functions/v1/assignment-action";
  }

  function fallbackCopy(action) {
    switch (action) {
      case "accept":
        return ON_SCREEN.accept_confirm;
      case "decline":
        return ON_SCREEN.declined_confirm;
      case "confirm_attendance":
        return {
          title: "Confirm you'll be there",
          message: "Tap Confirm to let us know you'll attend.",
          button: "Confirm",
        };
      case "cant_make_it":
        return ON_SCREEN.cant_make_it_confirm;
      default:
        return ON_SCREEN.link_inactive;
    }
  }

  async function apiCall(action, body) {
    const response = await fetch(SUPABASE_URL + endpointFor(action), {
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

  document.addEventListener("DOMContentLoaded", async function () {
    const params = getParams();
    const confirmBtn = qs("#respond-confirm-btn");
    const messageEl = qs("#respond-message");
    const actionsEl = qs("#respond-actions");

    const known =
      OFFER_ACTIONS[params.action] || ASSIGNMENT_ACTIONS[params.action];
    if (!params.token || !known) {
      setStatus(ON_SCREEN.link_inactive.title, ON_SCREEN.link_inactive.message);
      if (confirmBtn) confirmBtn.hidden = true;
      setMessage(messageEl, ON_SCREEN.link_inactive.message, "error");
      return;
    }

    let copy = fallbackCopy(params.action);
    setStatus(copy.title, copy.message);
    if (confirmBtn) confirmBtn.textContent = copy.button || "Confirm";

    // Load preview copy (includes appointment details / ref for accept)
    try {
      const preview = await apiCall(params.action, {
        token: params.token,
        action: params.action,
        preview: true,
      });
      if (preview.payload && preview.payload.title) {
        copy = {
          title: preview.payload.title,
          message: preview.payload.message || copy.message,
          button: preview.payload.button || copy.button,
        };
        setStatus(copy.title, copy.message);
        if (confirmBtn && copy.button) confirmBtn.textContent = copy.button;
      }
      if (preview.payload && preview.payload.ok === false) {
        setStatus(
          preview.payload.title || ON_SCREEN.link_inactive.title,
          preview.payload.message || ON_SCREEN.link_inactive.message
        );
        if (confirmBtn) confirmBtn.hidden = true;
        setMessage(
          messageEl,
          preview.payload.message || ON_SCREEN.link_inactive.message,
          "error"
        );
        return;
      }
    } catch (_err) {
      // keep fallback copy
    }

    if (params.action === "cant_make_it" && actionsEl) {
      const reasonWrap = document.createElement("div");
      reasonWrap.className = "book-field";
      reasonWrap.style.marginBottom = "14px";
      reasonWrap.innerHTML =
        '<label for="respond-reason">Reason (optional)</label>' +
        '<textarea id="respond-reason" rows="3" placeholder="e.g. traffic, illness, schedule conflict" style="width:100%;"></textarea>';
      actionsEl.parentNode.insertBefore(reasonWrap, actionsEl);
    }

    if (confirmBtn) {
      confirmBtn.addEventListener("click", async function () {
        confirmBtn.disabled = true;
        confirmBtn.setAttribute("aria-busy", "true");
        setMessage(messageEl, "Submitting your response…", "success");

        const body = {
          token: params.token,
          action: params.action,
        };
        if (params.action === "cant_make_it") {
          const reasonEl = qs("#respond-reason");
          body.reason = reasonEl ? String(reasonEl.value || "").trim() : "";
        }

        try {
          const result = await apiCall(params.action, body);
          const payload = result.payload || {};
          const ok = Boolean(payload.ok);
          const title =
            payload.title ||
            (ok ? "Response recorded" : ON_SCREEN.link_inactive.title);
          const message =
            payload.message ||
            (ok
              ? "Done."
              : ON_SCREEN.link_inactive.message);

          setMessage(messageEl, message, ok ? "success" : "error");
          setStatus(title, message);
          if (actionsEl) actionsEl.hidden = true;
          const reasonEl = qs("#respond-reason");
          if (reasonEl && reasonEl.closest(".book-field")) {
            reasonEl.closest(".book-field").hidden = true;
          }
        } catch (_err) {
          setMessage(
            messageEl,
            "Network error. Please try again in a moment.",
            "error"
          );
          confirmBtn.disabled = false;
          confirmBtn.removeAttribute("aria-busy");
        }
      });
    }
  });
})();
