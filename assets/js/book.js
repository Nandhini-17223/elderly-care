(function () {
  const SUPABASE_URL = "https://vzmhcqhcvflylmobpvap.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw";

  const SUBMIT_LABEL_HTML =
    'Request a Consultation<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2h12.2l-4.6-4.6L13 5z"/></svg>';

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function safeTrim(value) {
    return String(value ?? "").trim();
  }

  function setInvalid(el, isInvalid) {
    if (!el) return;
    el.setAttribute("aria-invalid", isInvalid ? "true" : "false");
  }

  function showMessage(messageEl, text, type) {
    if (!messageEl) return;
    messageEl.hidden = false;
    messageEl.textContent = text;
    messageEl.className =
      "book-form-message book-form-message--" + type + " is-visible";
  }

  function clearMessage(messageEl) {
    if (!messageEl) return;
    messageEl.hidden = true;
    messageEl.textContent = "";
    messageEl.className = "book-form-message";
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  document.addEventListener("DOMContentLoaded", function () {
    const form = qs("#book-form");
    const messageEl = qs("#book-form-message");
    const submitBtn = qs("#book-submit-btn");

    if (!form || !window.supabase) {
      return;
    }

    const supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearMessage(messageEl);

      const parentNameEl = qs("#book-parent-name", form);
      const parentAgeEl = qs("#book-parent-age", form);
      const cityEl = qs("#book-city", form);
      const contactNameEl = qs("#book-contact-name", form);
      const relationshipEl = qs("#book-relationship", form);
      const emailEl = qs("#book-email", form);
      const countryEl = qs("#book-phone-country", form);
      const phoneEl = qs("#book-phone", form);

      const parent_name = safeTrim(parentNameEl && parentNameEl.value);
      const parentAgeRaw = safeTrim(parentAgeEl && parentAgeEl.value);
      const parent_age = Number(parentAgeRaw);
      const city = safeTrim(cityEl && cityEl.value);
      const booking_person_name = safeTrim(contactNameEl && contactNameEl.value);
      const relationship = safeTrim(relationshipEl && relationshipEl.value);
      const email = safeTrim(emailEl && emailEl.value);
      const phone_country_code = safeTrim(countryEl && countryEl.value) || "+91";
      const phone = safeTrim(phoneEl && phoneEl.value);

      const checks = [
        { el: parentNameEl, ok: Boolean(parent_name), msg: "Please enter the parent's name." },
        {
          el: parentAgeEl,
          ok: Number.isInteger(parent_age) && parent_age > 0 && parent_age < 150,
          msg: "Please enter a valid age between 1 and 149.",
        },
        { el: cityEl, ok: Boolean(city), msg: "Please enter the current city." },
        {
          el: contactNameEl,
          ok: Boolean(booking_person_name),
          msg: "Please enter your name (booking person).",
        },
        {
          el: relationshipEl,
          ok: Boolean(relationship),
          msg: "Please enter your relationship to the parent.",
        },
        { el: emailEl, ok: Boolean(email) && isValidEmail(email), msg: "Please enter a valid email address." },
        { el: phoneEl, ok: Boolean(phone), msg: "Please enter a phone number." },
      ];

      let firstProblem = null;
      checks.forEach(function (check) {
        setInvalid(check.el, !check.ok);
        if (!check.ok && !firstProblem) firstProblem = check;
      });

      if (firstProblem) {
        showMessage(messageEl, firstProblem.msg, "error");
        firstProblem.el && firstProblem.el.focus && firstProblem.el.focus();
        return;
      }

      const payload = {
        parent_name: parent_name,
        parent_age: parent_age,
        city: city,
        booking_person_name: booking_person_name,
        relationship: relationship,
        email: email,
        phone_country_code: phone_country_code,
        phone: phone,
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting…";
      }

      try {
        const { error } = await supabaseClient
          .from("consultation_requests")
          .insert([payload]);

        if (error) {
          throw error;
        }

        form.reset();
        if (countryEl) countryEl.value = "+91";
        [
          parentNameEl,
          parentAgeEl,
          cityEl,
          contactNameEl,
          relationshipEl,
          emailEl,
          phoneEl,
        ].forEach(function (el) {
          setInvalid(el, false);
        });

        showMessage(
          messageEl,
          "Thank you! Your consultation request has been received. Our care advisor will contact you within 24 hours.",
          "success"
        );
      } catch (err) {
        console.error(err);
        showMessage(
          messageEl,
          "Sorry, we could not submit your request. Please try again or call +91 73399 11220.",
          "error"
        );
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = SUBMIT_LABEL_HTML;
        }
      }
    });
  });
})();
