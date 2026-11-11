(function () {
  const SUPABASE_URL = "https://vzmhcqhcvflylmobpvap.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw";
  const IST_TIME_ZONE = "Asia/Kolkata";
  const PINCODE_PATTERN = /^\d{6}$/;

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

  function showFieldError(errorEl, text) {
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = text;
    errorEl.className =
      "book-form-message book-form-message--error is-visible";
  }

  function clearFieldError(errorEl) {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = "";
    errorEl.className = "book-form-message";
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPincode(pincode) {
    return PINCODE_PATTERN.test(pincode);
  }

  function getIstParts(date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: IST_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date || new Date());

    const map = {};
    parts.forEach(function (part) {
      if (part.type !== "literal") map[part.type] = part.value;
    });

    const hour = map.hour === "24" ? "00" : map.hour;
    return {
      date: map.year + "-" + map.month + "-" + map.day,
      time: hour + ":" + map.minute,
      timeWithSeconds: hour + ":" + map.minute + ":" + map.second,
    };
  }

  function normalizeTime(value) {
    const trimmed = safeTrim(value);
    if (!trimmed) return "";
    const bits = trimmed.split(":");
    const hour = String(bits[0] || "0").padStart(2, "0");
    const minute = String(bits[1] || "0").padStart(2, "0");
    return hour + ":" + minute;
  }

  function isPastAppointment(appointmentDate, appointmentTime) {
    const istNow = getIstParts(new Date());
    if (appointmentDate < istNow.date) return "date";
    if (appointmentDate === istNow.date && appointmentTime < istNow.time) {
      return "time";
    }
    return null;
  }

  function isPastAppointmentDbError(err) {
    const message = String(
      (err && (err.message || err.details || err.hint)) || ""
    ).toLowerCase();
    return (
      message.indexOf("appointment") !== -1 &&
      (message.indexOf("past") !== -1 ||
        message.indexOf("future") !== -1 ||
        message.indexOf("asia/kolkata") !== -1 ||
        message.indexOf("earlier") !== -1)
    );
  }

  function isPincodeDbError(err) {
    const message = String(
      (err && (err.message || err.details || err.hint)) || ""
    ).toLowerCase();
    return message.indexOf("pincode") !== -1;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const form = qs("#book-form");
    const messageEl = qs("#book-form-message");
    const submitBtn = qs("#book-submit-btn");
    const appointmentDateEl = qs("#book-appointment-date", form);
    const appointmentTimeEl = qs("#book-appointment-time", form);
    const appointmentDateErrorEl = qs("#book-appointment-date-error", form);
    const appointmentTimeErrorEl = qs("#book-appointment-time-error", form);
    const pincodeErrorEl = qs("#book-pincode-error", form);

    if (!form || !window.supabase) {
      return;
    }

    function applyIstDateMin() {
      if (!appointmentDateEl) return;
      const todayIst = getIstParts(new Date()).date;
      appointmentDateEl.min = todayIst;
      if (appointmentDateEl.value && appointmentDateEl.value < todayIst) {
        appointmentDateEl.value = "";
      }
    }

    applyIstDateMin();
    // Keep the min aligned if the page stays open across midnight IST.
    setInterval(applyIstDateMin, 60 * 1000);

    const supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearMessage(messageEl);
      clearFieldError(appointmentDateErrorEl);
      clearFieldError(appointmentTimeErrorEl);
      clearFieldError(pincodeErrorEl);

      const parentNameEl = qs("#book-parent-name", form);
      const parentAgeEl = qs("#book-parent-age", form);
      const addressLine1El = qs("#book-address-line1", form);
      const streetEl = qs("#book-street", form);
      const areaEl = qs("#book-area", form);
      const landmarkEl = qs("#book-landmark", form);
      const cityEl = qs("#book-city", form);
      const pincodeEl = qs("#book-pincode", form);
      const contactNameEl = qs("#book-contact-name", form);
      const relationshipEl = qs("#book-relationship", form);
      const emailEl = qs("#book-email", form);
      const countryEl = qs("#book-phone-country", form);
      const phoneEl = qs("#book-phone", form);
      const doctorHospitalEl = qs("#book-doctor-hospital", form);
      const helperPreferenceEl = qs("#book-helper-preference", form);

      const parent_name = safeTrim(parentNameEl && parentNameEl.value);
      const parentAgeRaw = safeTrim(parentAgeEl && parentAgeEl.value);
      const parent_age = Number(parentAgeRaw);
      const address_line1 = safeTrim(addressLine1El && addressLine1El.value);
      const street = safeTrim(streetEl && streetEl.value);
      const area = safeTrim(areaEl && areaEl.value);
      const landmark = safeTrim(landmarkEl && landmarkEl.value);
      const city = safeTrim(cityEl && cityEl.value);
      const pincode = safeTrim(pincodeEl && pincodeEl.value);
      const booking_person_name = safeTrim(contactNameEl && contactNameEl.value);
      const relationship = safeTrim(relationshipEl && relationshipEl.value);
      const email = safeTrim(emailEl && emailEl.value);
      const phone_country_code = safeTrim(countryEl && countryEl.value) || "+91";
      const phone = safeTrim(phoneEl && phoneEl.value);
      const appointment_date = safeTrim(
        appointmentDateEl && appointmentDateEl.value
      );
      const appointment_time = normalizeTime(
        appointmentTimeEl && appointmentTimeEl.value
      );
      const doctor_hospital = safeTrim(
        doctorHospitalEl && doctorHospitalEl.value
      );
      const helper_preference =
        safeTrim(helperPreferenceEl && helperPreferenceEl.value) || "any";

      applyIstDateMin();

      const checks = [
        { el: parentNameEl, ok: Boolean(parent_name), msg: "Please enter the parent's name." },
        {
          el: parentAgeEl,
          ok: Number.isInteger(parent_age) && parent_age > 0 && parent_age < 150,
          msg: "Please enter a valid age between 1 and 149.",
        },
        {
          el: addressLine1El,
          ok: Boolean(address_line1),
          msg: "Please enter the house / flat number.",
        },
        {
          el: streetEl,
          ok: Boolean(street),
          msg: "Please enter the street / road.",
        },
        {
          el: areaEl,
          ok: Boolean(area),
          msg: "Please enter the area / locality.",
        },
        { el: cityEl, ok: Boolean(city), msg: "Please enter the current city." },
        {
          el: pincodeEl,
          ok: isValidPincode(pincode),
          msg: "Please enter a valid 6-digit pincode.",
        },
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
        {
          el: appointmentDateEl,
          ok: Boolean(appointment_date),
          msg: "Please select an appointment date.",
        },
        {
          el: appointmentTimeEl,
          ok: Boolean(appointment_time),
          msg: "Please select an appointment time.",
        },
        {
          el: doctorHospitalEl,
          ok: Boolean(doctor_hospital),
          msg: "Please enter the doctor or hospital name.",
        },
        {
          el: helperPreferenceEl,
          ok: ["female", "male", "any"].indexOf(helper_preference) !== -1,
          msg: "Please select a helper preference.",
        },
      ];

      let firstProblem = null;
      checks.forEach(function (check) {
        setInvalid(check.el, !check.ok);
        if (!check.ok && !firstProblem) firstProblem = check;
      });

      if (firstProblem) {
        if (firstProblem.el === pincodeEl) {
          showFieldError(pincodeErrorEl, firstProblem.msg);
        }
        showMessage(messageEl, firstProblem.msg, "error");
        firstProblem.el && firstProblem.el.focus && firstProblem.el.focus();
        return;
      }

      const pastKind = isPastAppointment(appointment_date, appointment_time);
      if (pastKind === "date") {
        setInvalid(appointmentDateEl, true);
        setInvalid(appointmentTimeEl, false);
        showFieldError(
          appointmentDateErrorEl,
          "Please choose today or a future date (India time)."
        );
        showMessage(
          messageEl,
          "Appointment date cannot be in the past (India time).",
          "error"
        );
        appointmentDateEl && appointmentDateEl.focus && appointmentDateEl.focus();
        return;
      }
      if (pastKind === "time") {
        setInvalid(appointmentDateEl, false);
        setInvalid(appointmentTimeEl, true);
        showFieldError(
          appointmentTimeErrorEl,
          "Please choose a time later than the current India time."
        );
        showMessage(
          messageEl,
          "Appointment time cannot be earlier than the current India time.",
          "error"
        );
        appointmentTimeEl && appointmentTimeEl.focus && appointmentTimeEl.focus();
        return;
      }

      setInvalid(appointmentDateEl, false);
      setInvalid(appointmentTimeEl, false);

      const payload = {
        parent_name: parent_name,
        parent_age: parent_age,
        address_line1: address_line1,
        street: street,
        area: area,
        landmark: landmark || null,
        city: city,
        pincode: pincode,
        booking_person_name: booking_person_name,
        relationship: relationship,
        email: email,
        phone_country_code: phone_country_code,
        phone: phone,
        appointment_date: appointment_date,
        appointment_time: appointment_time,
        doctor_hospital: doctor_hospital,
        helper_preference: helper_preference,
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
        if (helperPreferenceEl) helperPreferenceEl.value = "any";
        applyIstDateMin();
        [
          parentNameEl,
          parentAgeEl,
          addressLine1El,
          streetEl,
          areaEl,
          landmarkEl,
          cityEl,
          pincodeEl,
          contactNameEl,
          relationshipEl,
          emailEl,
          phoneEl,
          appointmentDateEl,
          appointmentTimeEl,
          doctorHospitalEl,
          helperPreferenceEl,
        ].forEach(function (el) {
          setInvalid(el, false);
        });
        clearFieldError(appointmentDateErrorEl);
        clearFieldError(appointmentTimeErrorEl);
        clearFieldError(pincodeErrorEl);

        showMessage(
          messageEl,
          "Thank you! Your consultation request has been received. Our care advisor will contact you within 24 hours.",
          "success"
        );
      } catch (err) {
        console.error(err);
        if (isPastAppointmentDbError(err)) {
          setInvalid(appointmentTimeEl, true);
          showFieldError(
            appointmentTimeErrorEl,
            "That appointment time has already passed in India. Please choose a later time."
          );
          showMessage(
            messageEl,
            "That appointment time has already passed in India. Please choose a later date or time.",
            "error"
          );
          appointmentTimeEl &&
            appointmentTimeEl.focus &&
            appointmentTimeEl.focus();
        } else if (isPincodeDbError(err)) {
          setInvalid(pincodeEl, true);
          showFieldError(
            pincodeErrorEl,
            "Please enter a valid 6-digit pincode."
          );
          showMessage(
            messageEl,
            "Please enter a valid 6-digit pincode.",
            "error"
          );
          pincodeEl && pincodeEl.focus && pincodeEl.focus();
        } else {
          showMessage(
            messageEl,
            "Sorry, we could not submit your request. Please try again or call +91 73399 11220.",
            "error"
          );
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = SUBMIT_LABEL_HTML;
        }
      }
    });
  });
})();
