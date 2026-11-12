(function () {
  const AdminAuth = window.AdminAuth;
  const AdminApi = window.AdminApi;
  const esc = AdminAuth.escapeHtml;

  let helperId = null;
  let helper = null;
  let loginProfile = null;

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

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function todayIst() {
    return AdminApi.todayIstDateString();
  }

  function isAadhaarDone(h) {
    return Boolean(h.aadhaar_qr_verified && /^\d{4}$/.test(h.aadhaar_last4 || ""));
  }

  function isSecondIdDone(h) {
    if (!h.second_id_type || !/^\d{4}$/.test(h.second_id_last4 || "")) return false;
    if (h.can_drive) {
      if (h.second_id_type !== "driving_licence") return false;
      if (!h.dl_expiry || String(h.dl_expiry) <= todayIst()) return false;
    }
    return true;
  }

  function isBgDone(h) {
    return Boolean(h.bg_check_method && h.bg_check_date);
  }

  function isPhotoDone(h) {
    return h.photo_status === "approved";
  }

  function progress(h) {
    const items = {
      aadhaar: isAadhaarDone(h),
      second_id: isSecondIdDone(h),
      bg_check: isBgDone(h),
      photo: isPhotoDone(h),
    };
    const done = Object.keys(items).filter(function (k) {
      return items[k];
    }).length;
    return { done: done, total: 4, items: items };
  }

  function syncDlFields() {
    const canDrive = qs("#can_drive").checked;
    const type = qs("#second_id_type").value;
    const showDl = canDrive || type === "driving_licence";
    qs("#dl-fields").hidden = !showDl;
    qs("#dl-driver-hint").hidden = !canDrive;
    if (canDrive) {
      qs("#second_id_type").value = "driving_licence";
      qs("#second_id_type").disabled = true;
    } else {
      qs("#second_id_type").disabled = false;
    }
  }

  function fillForm(h) {
    qs("#full_name").value = h.full_name || "";
    qs("#gender").value = h.gender || "female";
    qs("#email").value = h.email || "";
    qs("#phone").value = h.phone || "";
    qs("#home_area").value = h.home_area || "";
    qs("#home_pincode").value = h.home_pincode || "";
    qs("#max_travel_km").value = h.max_travel_km || 10;
    qs("#languages").value = h.languages || "";
    qs("#can_drive").checked = Boolean(h.can_drive);
    qs("#notes").value = h.notes || "";

    qs("#aadhaar_qr_verified").checked = Boolean(h.aadhaar_qr_verified);
    qs("#aadhaar_last4").value = h.aadhaar_last4 || "";
    qs("#aadhaar-meta").textContent = h.aadhaar_verified_at
      ? "Recorded " + AdminApi.formatIstDateTime(h.aadhaar_verified_at)
      : "";

    qs("#second_id_type").value = h.second_id_type || (h.can_drive ? "driving_licence" : "pan");
    qs("#second_id_last4").value = h.second_id_last4 || "";
    qs("#dl_last4").value = h.dl_last4 || "";
    qs("#dl_expiry").value = h.dl_expiry || "";

    qs("#bg_check_method").value = h.bg_check_method || "in_house";
    qs("#bg_check_reference").value = h.bg_check_reference || "";
    qs("#bg_check_date").value = h.bg_check_date || "";
    qs("#bg_check_notes").value = h.bg_check_notes || "";

    qs("#references_checked").checked = Boolean(h.references_checked);
    qs("#references_notes").value = h.references_notes || "";
    qs("#photo-status-line").textContent =
      "Photo status: " + (h.photo_status || "none");

    syncDlFields();
    updateVerificationUi(h);
  }

  function updateVerificationUi(h) {
    const p = progress(h);
    qs("#verification-progress").textContent =
      p.done + " of " + p.total + " required checks done";
    qs("#verification-status-line").textContent =
      "Status: " +
      (h.verification_status || "pending") +
      (h.verified_at
        ? " · verified " + AdminApi.formatIstDateTime(h.verified_at)
        : "") +
      (h.rejection_reason ? " · reason: " + h.rejection_reason : "");
    qs("#mark-verified-btn").disabled = !(
      p.done === 4 && h.verification_status !== "verified"
    );
    qs("#toggle-active-btn").textContent = h.is_active
      ? "Deactivate"
      : "Reactivate";

    const createLoginBtn = qs("#create-login-btn");
    const loginPw = qs("#login_password");
    if (loginProfile) {
      qs("#login-status-line").textContent =
        "Login exists · " +
        (loginProfile.is_active ? "enabled" : "disabled") +
        " · role helper";
      qs("#login-create-form").hidden = true;
      qs("#toggle-login-btn").hidden = false;
      qs("#toggle-login-btn").textContent = loginProfile.is_active
        ? "Disable login"
        : "Enable login";
    } else {
      qs("#login-status-line").textContent =
        h.verification_status === "verified"
          ? "No login yet. Create one with a temporary password."
          : "No login yet. Available after verification.";
      qs("#login-create-form").hidden = h.verification_status !== "verified";
      qs("#toggle-login-btn").hidden = true;
      createLoginBtn.disabled = h.verification_status !== "verified";
      loginPw.disabled = h.verification_status !== "verified";
    }
  }

  function renderJobs(jobs) {
    const ul = qs("#upcoming-jobs");
    if (!jobs || !jobs.length) {
      ul.innerHTML = '<li class="admin-muted">None</li>';
      return;
    }
    ul.innerHTML = jobs
      .map(function (j) {
        return (
          "<li><strong>" +
          esc(j.ref_number || j.parent_name) +
          "</strong>" +
          (j.ref_number ? " · " + esc(j.parent_name) : "") +
          " — " +
          esc(AdminApi.formatIstDate(j.appointment_date)) +
          " " +
          esc(AdminApi.formatIstTime(j.appointment_time)) +
          " · " +
          esc(j.doctor_hospital || "") +
          (j.area ? " · " + esc(j.area) : "") +
          "</li>"
        );
      })
      .join("");
  }

  async function loadPhotoPreview() {
    const img = qs("#photo-preview");
    if (!helper || !helper.photo_path) {
      img.hidden = true;
      img.removeAttribute("src");
      return;
    }
    const result = await AdminApi.callHelperAdmin({
      action: "photo_signed_url",
      helper_id: helperId,
    });
    if (
      result.payload &&
      result.payload.ok &&
      (result.payload.signed_url || result.payload.signedUrl)
    ) {
      img.src = result.payload.signed_url || result.payload.signedUrl;
      img.hidden = false;
    } else {
      img.hidden = true;
    }
  }

  async function reload() {
    const result = await AdminApi.callHelperAdmin({
      action: "get",
      helper_id: helperId,
    });
    const payload = result.payload || {};
    if (!payload.ok || !payload.helper) {
      setMessage(
        qs("#helper-message"),
        payload.error || "Helper not found.",
        "error"
      );
      return;
    }
    helper = payload.helper;
    loginProfile = payload.login || null;
    qs("#helper-title").textContent = helper.full_name;
    qs("#helper-subtitle").textContent =
      helper.email + " · " + (helper.phone || "");
    qs("#verification-panel").hidden = false;
    fillForm(helper);
    renderJobs(payload.upcoming_jobs || []);
    await loadPhotoPreview();
  }

  async function confirmJobsIfNeeded(payload, actionLabel) {
    if (payload.code !== "needs_confirmation") return true;
    const jobs = payload.jobs || [];
    const lines = jobs
      .map(function (j) {
        return (
          "- " +
          j.parent_name +
          " on " +
          j.appointment_date +
          " " +
          String(j.appointment_time || "").slice(0, 5)
        );
      })
      .join("\n");
    return window.confirm(
      actionLabel +
        " will move these upcoming assigned jobs to needs_senior (helper_unavailable):\n\n" +
        lines +
        "\n\nContinue?"
    );
  }

  async function saveProfile(ev) {
    ev.preventDefault();
    const body = {
      full_name: qs("#full_name").value.trim(),
      gender: qs("#gender").value,
      email: qs("#email").value.trim().toLowerCase(),
      phone: qs("#phone").value.trim(),
      home_area: qs("#home_area").value.trim(),
      home_pincode: qs("#home_pincode").value.trim(),
      max_travel_km: Number(qs("#max_travel_km").value),
      languages: qs("#languages").value.trim(),
      can_drive: qs("#can_drive").checked,
      notes: qs("#notes").value.trim(),
    };
    if (!/^\d{6}$/.test(body.home_pincode)) {
      setMessage(qs("#helper-message"), "Home pincode must be 6 digits.", "error");
      return;
    }
    setMessage(qs("#helper-message"), "Saving…", "success");
    const result = await AdminApi.callHelperAdmin(
      helperId
        ? Object.assign({ action: "update", helper_id: helperId }, body)
        : Object.assign({ action: "create" }, body)
    );
    const payload = result.payload || {};
    if (!payload.ok) {
      setMessage(
        qs("#helper-message"),
        payload.error || "Could not save helper.",
        "error"
      );
      return;
    }
    if (!helperId) {
      helperId = payload.helper_id || (payload.helper && payload.helper.id);
      history.replaceState({}, "", "helper.html?id=" + encodeURIComponent(helperId));
    }
    setMessage(qs("#helper-message"), payload.message || "Saved.", "success");
    await reload();
  }

  async function handleAction(action) {
    if (!helperId) return;
    let body = { action: action, helper_id: helperId };

    if (action === "save_aadhaar") {
      const last4 = qs("#aadhaar_last4").value.trim();
      if (!/^\d{4}$/.test(last4)) {
        setMessage(
          qs("#helper-message"),
          "Aadhaar last 4 must be exactly 4 digits. Full numbers are not allowed.",
          "error"
        );
        return;
      }
      if (!qs("#aadhaar_qr_verified").checked) {
        setMessage(
          qs("#helper-message"),
          "Confirm QR verification in the mAadhaar app.",
          "error"
        );
        return;
      }
      body.aadhaar_qr_verified = true;
      body.aadhaar_last4 = last4;
    }

    if (action === "save_second_id") {
      body.second_id_type = qs("#second_id_type").value;
      body.second_id_last4 = qs("#second_id_last4").value.trim();
      body.dl_last4 = qs("#dl_last4").value.trim() || body.second_id_last4;
      body.dl_expiry = qs("#dl_expiry").value || null;
      if (!/^\d{4}$/.test(body.second_id_last4)) {
        setMessage(qs("#helper-message"), "ID last 4 must be exactly 4 digits.", "error");
        return;
      }
    }

    if (action === "save_bg_check") {
      body.bg_check_method = qs("#bg_check_method").value;
      body.bg_check_reference = qs("#bg_check_reference").value.trim();
      body.bg_check_notes = qs("#bg_check_notes").value.trim();
      body.bg_check_date = qs("#bg_check_date").value;
      if (!body.bg_check_date) {
        setMessage(qs("#helper-message"), "Background check date is required.", "error");
        return;
      }
    }

    if (action === "save_references") {
      body.references_checked = qs("#references_checked").checked;
      body.references_notes = qs("#references_notes").value.trim();
    }

    if (action === "photo_review_approve") {
      body.action = "photo_review";
      body.decision = "approved";
    }
    if (action === "photo_review_reject") {
      body.action = "photo_review";
      body.decision = "rejected";
    }

    setMessage(qs("#helper-message"), "Saving…", "success");
    const result = await AdminApi.callHelperAdmin(body);
    const payload = result.payload || {};
    if (!payload.ok) {
      setMessage(
        qs("#helper-message"),
        payload.error || payload.message || "Action failed.",
        "error"
      );
      return;
    }
    setMessage(qs("#helper-message"), payload.message || "Saved.", "success");
    await reload();
  }

  async function uploadPhoto() {
    if (!helperId) return;
    const file = qs("#photo_file").files[0];
    if (!file) {
      setMessage(qs("#helper-message"), "Choose a JPG or PNG file first.", "error");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setMessage(qs("#helper-message"), "Only JPG/PNG allowed.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage(qs("#helper-message"), "Photo must be 5 MB or smaller.", "error");
      return;
    }
    setMessage(qs("#helper-message"), "Uploading photo…", "success");
    const ext = file.type === "image/png" ? "png" : "jpg";
    const urlResult = await AdminApi.callHelperAdmin({
      action: "photo_upload_url",
      helper_id: helperId,
      content_type: file.type,
      file_ext: ext,
    });
    const urlPayload = urlResult.payload || {};
    const uploadUrl = urlPayload.signed_url || urlPayload.signedUrl;
    if (!urlPayload.ok || !uploadUrl) {
      setMessage(
        qs("#helper-message"),
        urlPayload.error || "Could not start upload.",
        "error"
      );
      return;
    }

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });
    if (!put.ok) {
      setMessage(qs("#helper-message"), "Upload to storage failed.", "error");
      return;
    }

    const confirm = await AdminApi.callHelperAdmin({
      action: "photo_confirm",
      helper_id: helperId,
      path: urlPayload.path,
    });
    if (!confirm.payload || !confirm.payload.ok) {
      setMessage(
        qs("#helper-message"),
        (confirm.payload && confirm.payload.error) || "Could not save photo path.",
        "error"
      );
      return;
    }
    setMessage(qs("#helper-message"), "Photo uploaded — pending approval.", "success");
    await reload();
  }

  async function markVerified() {
    const result = await AdminApi.callHelperAdmin({
      action: "mark_verified",
      helper_id: helperId,
    });
    const payload = result.payload || {};
    setMessage(
      qs("#helper-message"),
      payload.message || payload.error || (payload.ok ? "Verified." : "Not ready."),
      payload.ok ? "success" : "error"
    );
    if (payload.ok) await reload();
  }

  async function rejectHelper() {
    const reason = window.prompt("Rejection reason (required):");
    if (reason == null) return;
    if (!String(reason).trim()) {
      setMessage(qs("#helper-message"), "Rejection reason is required.", "error");
      return;
    }
    let result = await AdminApi.callHelperAdmin({
      action: "reject",
      helper_id: helperId,
      rejection_reason: String(reason).trim(),
    });
    let payload = result.payload || {};
    if (payload.code === "needs_confirmation") {
      const ok = await confirmJobsIfNeeded(payload, "Rejecting this helper");
      if (!ok) return;
      result = await AdminApi.callHelperAdmin({
        action: "reject",
        helper_id: helperId,
        rejection_reason: String(reason).trim(),
        confirm: true,
      });
      payload = result.payload || {};
    }
    setMessage(
      qs("#helper-message"),
      payload.message || payload.error || (payload.ok ? "Rejected." : "Failed."),
      payload.ok ? "success" : "error"
    );
    if (payload.ok) await reload();
  }

  async function toggleActive() {
    const next = !(helper && helper.is_active);
    let result = await AdminApi.callHelperAdmin({
      action: "set_active",
      helper_id: helperId,
      is_active: next,
    });
    let payload = result.payload || {};
    if (payload.code === "needs_confirmation") {
      const ok = await confirmJobsIfNeeded(payload, "Deactivating this helper");
      if (!ok) return;
      result = await AdminApi.callHelperAdmin({
        action: "set_active",
        helper_id: helperId,
        is_active: next,
        confirm: true,
      });
      payload = result.payload || {};
    }
    setMessage(
      qs("#helper-message"),
      payload.message || payload.error || (payload.ok ? "Updated." : "Failed."),
      payload.ok ? "success" : "error"
    );
    if (payload.ok) await reload();
  }

  async function createLogin() {
    const password = qs("#login_password").value;
    if (!password || password.length < 8) {
      setMessage(
        qs("#helper-message"),
        "Temporary password must be at least 8 characters.",
        "error"
      );
      return;
    }
    const result = await AdminApi.callHelperAdmin({
      action: "create_login",
      helper_id: helperId,
      password: password,
    });
    const payload = result.payload || {};
    setMessage(
      qs("#helper-message"),
      payload.message || payload.error || (payload.ok ? "Login created." : "Failed."),
      payload.ok ? "success" : "error"
    );
    if (payload.ok) {
      qs("#login_password").value = "";
      await reload();
    }
  }

  async function toggleLogin() {
    if (!loginProfile) return;
    const result = await AdminApi.callHelperAdmin({
      action: "set_login_active",
      helper_id: helperId,
      is_active: !loginProfile.is_active,
    });
    const payload = result.payload || {};
    setMessage(
      qs("#helper-message"),
      payload.message || payload.error || (payload.ok ? "Updated." : "Failed."),
      payload.ok ? "success" : "error"
    );
    if (payload.ok) await reload();
  }

  async function init() {
    const session = await AdminAuth.requireStaff();
    if (!session) return;

    helperId = params().get("id");
    qs("#helper-form").addEventListener("submit", saveProfile);
    qs("#can_drive").addEventListener("change", syncDlFields);
    qs("#second_id_type").addEventListener("change", syncDlFields);

    document.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const action = btn.getAttribute("data-action");
        if (action === "upload_photo") uploadPhoto();
        else if (action === "approve_photo") handleAction("photo_review_approve");
        else if (action === "reject_photo") handleAction("photo_review_reject");
        else handleAction(action);
      });
    });

    qs("#mark-verified-btn").addEventListener("click", markVerified);
    qs("#reject-helper-btn").addEventListener("click", rejectHelper);
    qs("#toggle-active-btn").addEventListener("click", toggleActive);
    qs("#create-login-btn").addEventListener("click", createLogin);
    qs("#toggle-login-btn").addEventListener("click", toggleLogin);

    // Block pasting long Aadhaar-looking numbers into last4 fields
    ["#aadhaar_last4", "#second_id_last4", "#dl_last4"].forEach(function (sel) {
      qs(sel).addEventListener("input", function (ev) {
        ev.target.value = ev.target.value.replace(/\D/g, "").slice(0, 4);
      });
    });

    if (helperId) {
      qs("#verification-panel").hidden = false;
      await reload();
    } else {
      syncDlFields();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
