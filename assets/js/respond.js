(function () {
  const SUPABASE_URL = "https://vzmhcqhcvflylmobpvap.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw";

  const OFFER_ACTIONS = { accept: true, decline: true };
  const ASSIGNMENT_ACTIONS = {
    confirm_attendance: true,
    cant_make_it: true,
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

  function copyFor(action) {
    switch (action) {
      case "accept":
        return {
          title: "Confirm acceptance",
          detail:
            "Click below to accept this appointment. Email scanners cannot confirm for you.",
          button: "Confirm Accept",
          success: "This appointment is yours!",
        };
      case "decline":
        return {
          title: "Confirm decline",
          detail:
            "Click below to decline this appointment. Email scanners cannot confirm for you.",
          button: "Confirm Decline",
          success: "Thanks, noted.",
        };
      case "confirm_attendance":
        return {
          title: "Confirm you’ll be there",
          detail:
            "Click below to confirm attendance. Email scanners cannot confirm for you.",
          button: "Confirm I’ll be there",
          success: "Thanks, see you there!",
        };
      case "cant_make_it":
        return {
          title: "Can’t make it?",
          detail:
            "Optionally share a reason, then confirm. Email scanners cannot submit for you.",
          button: "Confirm I can’t make it",
          success: "Thanks for letting us know. We’ll arrange a replacement.",
        };
      default:
        return {
          title: "Invalid link",
          detail: "This link is missing required details.",
          button: "Confirm",
          success: "Done.",
        };
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const params = getParams();
    const confirmBtn = qs("#respond-confirm-btn");
    const messageEl = qs("#respond-message");
    const actionsEl = qs("#respond-actions");

    const known =
      OFFER_ACTIONS[params.action] || ASSIGNMENT_ACTIONS[params.action];
    if (!params.token || !known) {
      setStatus("Invalid link", "This link is missing required details.");
      if (confirmBtn) confirmBtn.hidden = true;
      setMessage(
        messageEl,
        "Please open the action link from your email.",
        "error"
      );
      return;
    }

    const copy = copyFor(params.action);
    setStatus(copy.title, copy.detail);

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
      confirmBtn.textContent = copy.button;
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
          const response = await fetch(SUPABASE_URL + endpointFor(params.action), {
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

          const message =
            (payload && payload.message) ||
            (response.ok ? copy.success : "Something went wrong. Please try again.");

          const ok = Boolean(payload && payload.ok);
          setMessage(messageEl, message, ok ? "success" : "error");
          setStatus(ok ? "Response recorded" : "Unable to complete", message);
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
