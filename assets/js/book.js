(function () {
  const SUPABASE_URL = "https://vzmhcqhcvflylmobpvap.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw";
  const IST_TIME_ZONE = "Asia/Kolkata";
  const PINCODE_PATTERN = /^\d{6}$/;
  const PHONE_PATTERN = /^\d{10}$/;
  const SUMMARY_ERROR = "Please fix the highlighted fields";

  const SUBMIT_LABEL_HTML =
    'Request a Consultation<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2h12.2l-4.6-4.6L13 5z"/></svg>';

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function safeTrim(value) {
    return String(value ?? "").trim();
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

  function isValidPincode(pincode) {
    return PINCODE_PATTERN.test(pincode);
  }

  function isValidPhone(phone) {
    return PHONE_PATTERN.test(phone);
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

    if (!form || !window.supabase) {
      return;
    }

    const fields = {
      parentName: {
        el: qs("#book-parent-name", form),
        errorEl: qs("#book-parent-name-error", form),
        hintId: null,
        message: "Please enter the parent's name",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return Boolean(value);
        },
      },
      parentAge: {
        el: qs("#book-parent-age", form),
        errorEl: qs("#book-parent-age-error", form),
        hintId: null,
        message: "Please enter an age between 40 and 120",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          if (!value) return false;
          const age = Number(value);
          return Number.isInteger(age) && age >= 40 && age <= 120;
        },
      },
      addressLine1: {
        el: qs("#book-address-line1", form),
        errorEl: qs("#book-address-line1-error", form),
        hintId: null,
        message: "Please enter the house / flat number",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return Boolean(value);
        },
      },
      street: {
        el: qs("#book-street", form),
        errorEl: qs("#book-street-error", form),
        hintId: null,
        message: "Please enter the street or road",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return Boolean(value);
        },
      },
      area: {
        el: qs("#book-area", form),
        errorEl: qs("#book-area-error", form),
        hintId: null,
        message: "Please enter the area or locality",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return Boolean(value);
        },
      },
      city: {
        el: qs("#book-city", form),
        errorEl: qs("#book-city-error", form),
        hintId: null,
        message: "Please enter the city",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return Boolean(value);
        },
      },
      pincode: {
        el: qs("#book-pincode", form),
        errorEl: qs("#book-pincode-error", form),
        hintId: "book-pincode-hint",
        message: "Please enter a valid 6-digit pincode",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return isValidPincode(value);
        },
      },
      contactName: {
        el: qs("#book-contact-name", form),
        errorEl: qs("#book-contact-name-error", form),
        hintId: null,
        message: "Please enter your name",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return Boolean(value);
        },
      },
      relationship: {
        el: qs("#book-relationship", form),
        errorEl: qs("#book-relationship-error", form),
        hintId: null,
        message: "Please enter your relationship to the parent",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return Boolean(value);
        },
      },
      email: {
        el: qs("#book-email", form),
        errorEl: qs("#book-email-error", form),
        hintId: null,
        message: "Please enter a valid email address",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return Boolean(value) && isValidEmail(value);
        },
      },
      phone: {
        el: qs("#book-phone", form),
        errorEl: qs("#book-phone-error", form),
        hintId: "book-phone-hint",
        message: "Please enter a valid 10-digit mobile number",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return isValidPhone(value);
        },
      },
      appointmentDate: {
        el: qs("#book-appointment-date", form),
        errorEl: qs("#book-appointment-date-error", form),
        hintId: null,
        message: "Please choose an appointment date (today or later)",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          if (!value) return false;
          const todayIst = getIstParts(new Date()).date;
          return value >= todayIst;
        },
      },
      appointmentTime: {
        el: qs("#book-appointment-time", form),
        errorEl: qs("#book-appointment-time-error", form),
        hintId: null,
        message: "Please choose a time later than now",
        getValue: function () {
          return normalizeTime(this.el && this.el.value);
        },
        isValid: function (value) {
          if (!value) return false;
          const appointmentDate = fields.appointmentDate.getValue();
          // Empty/past dates are handled by the date field; only enforce "later
          // than now" when the chosen day is today in India time.
          if (!appointmentDate) return true;
          const todayIst = getIstParts(new Date()).date;
          if (appointmentDate !== todayIst) return true;
          return isPastAppointment(appointmentDate, value) !== "time";
        },
      },
      doctorHospital: {
        el: qs("#book-doctor-hospital", form),
        errorEl: qs("#book-doctor-hospital-error", form),
        hintId: null,
        message: "Please enter the doctor or hospital name",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return Boolean(value);
        },
      },
      helperPreference: {
        el: qs("#book-helper-preference", form),
        errorEl: qs("#book-helper-preference-error", form),
        hintId: null,
        message: "Please choose a helper preference",
        getValue: function () {
          return safeTrim(this.el && this.el.value);
        },
        isValid: function (value) {
          return ["female", "male", "any"].indexOf(value) !== -1;
        },
      },
    };

    const fieldOrder = [
      "parentName",
      "parentAge",
      "addressLine1",
      "street",
      "area",
      "city",
      "pincode",
      "contactName",
      "relationship",
      "email",
      "phone",
      "appointmentDate",
      "appointmentTime",
      "doctorHospital",
      "helperPreference",
    ];

    const landmarkEl = qs("#book-landmark", form);
    const countryEl = qs("#book-phone-country", form);

    function describedByFor(field, hasError) {
      const ids = [];
      if (field.hintId) ids.push(field.hintId);
      if (hasError && field.errorEl && field.errorEl.id) {
        ids.push(field.errorEl.id);
      }
      return ids.join(" ");
    }

    function setFieldError(field, message) {
      if (!field || !field.el) return;
      field.el.setAttribute("aria-invalid", "true");
      const describedBy = describedByFor(field, true);
      if (describedBy) {
        field.el.setAttribute("aria-describedby", describedBy);
      } else {
        field.el.removeAttribute("aria-describedby");
      }
      if (field.errorEl) {
        field.errorEl.hidden = false;
        field.errorEl.textContent = message || field.message;
        field.errorEl.className =
          "book-form-message book-form-message--error is-visible";
      }
    }

    function clearFieldError(field) {
      if (!field || !field.el) return;
      field.el.setAttribute("aria-invalid", "false");
      const describedBy = describedByFor(field, false);
      if (describedBy) {
        field.el.setAttribute("aria-describedby", describedBy);
      } else {
        field.el.removeAttribute("aria-describedby");
      }
      if (field.errorEl) {
        field.errorEl.hidden = true;
        field.errorEl.textContent = "";
        field.errorEl.className = "book-form-message";
      }
    }

    function clearAllFieldErrors() {
      fieldOrder.forEach(function (key) {
        clearFieldError(fields[key]);
      });
    }

    function validateField(key, options) {
      const field = fields[key];
      if (!field || !field.el) return true;
      const opts = options || {};
      const value = field.getValue();
      const ok = field.isValid(value);
      if (ok) {
        clearFieldError(field);
        return true;
      }
      if (opts.showError !== false) {
        setFieldError(field, field.message);
      }
      return false;
    }

    function applyIstDateMin() {
      const appointmentDateEl = fields.appointmentDate.el;
      if (!appointmentDateEl) return;
      const todayIst = getIstParts(new Date()).date;
      appointmentDateEl.min = todayIst;
      if (appointmentDateEl.value && appointmentDateEl.value < todayIst) {
        appointmentDateEl.value = "";
      }
    }

    applyIstDateMin();
    setInterval(applyIstDateMin, 60 * 1000);

    fieldOrder.forEach(function (key) {
      const field = fields[key];
      if (!field || !field.el) return;

      field.el.addEventListener("blur", function () {
        validateField(key);
      });

      const clearEvent =
        field.el.tagName === "SELECT" ||
        field.el.type === "date" ||
        field.el.type === "time"
          ? "change"
          : "input";

      field.el.addEventListener(clearEvent, function () {
        const currentlyInvalid =
          field.el.getAttribute("aria-invalid") === "true";
        if (!currentlyInvalid) return;
        if (field.isValid(field.getValue())) {
          clearFieldError(field);
          if (key === "appointmentDate" && fields.appointmentTime.el) {
            const timeInvalid =
              fields.appointmentTime.el.getAttribute("aria-invalid") === "true";
            if (timeInvalid) {
              validateField("appointmentTime");
            }
          }
        }
      });
    });

    // Changing the date can resolve or create a time error for "today".
    if (fields.appointmentDate.el && fields.appointmentTime.el) {
      fields.appointmentDate.el.addEventListener("change", function () {
        const timeHasError =
          fields.appointmentTime.el.getAttribute("aria-invalid") === "true";
        const timeHasValue = Boolean(fields.appointmentTime.getValue());
        if (!timeHasError && !timeHasValue) return;
        validateField("appointmentTime", { showError: timeHasError });
      });
    }

    const supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearMessage(messageEl);

      applyIstDateMin();

      const invalidKeys = [];
      fieldOrder.forEach(function (key) {
        if (!validateField(key)) invalidKeys.push(key);
      });

      // Ensure appointment time reflects the latest date choice.
      if (fields.appointmentTime.el) {
        const timeOk = validateField("appointmentTime");
        const idx = invalidKeys.indexOf("appointmentTime");
        if (!timeOk && idx === -1) invalidKeys.push("appointmentTime");
        if (timeOk && idx !== -1) invalidKeys.splice(idx, 1);
      }

      if (invalidKeys.length) {
        showMessage(messageEl, SUMMARY_ERROR, "error");
        const first = fields[invalidKeys[0]];
        if (first && first.el) {
          if (typeof first.el.scrollIntoView === "function") {
            first.el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          if (typeof first.el.focus === "function") {
            first.el.focus();
          }
        }
        return;
      }

      const parent_name = fields.parentName.getValue();
      const parent_age = Number(fields.parentAge.getValue());
      const address_line1 = fields.addressLine1.getValue();
      const street = fields.street.getValue();
      const area = fields.area.getValue();
      const landmark = safeTrim(landmarkEl && landmarkEl.value);
      const city = fields.city.getValue();
      const pincode = fields.pincode.getValue();
      const booking_person_name = fields.contactName.getValue();
      const relationship = fields.relationship.getValue();
      const email = fields.email.getValue();
      const phone_country_code = safeTrim(countryEl && countryEl.value) || "+91";
      const phone = fields.phone.getValue();
      const appointment_date = fields.appointmentDate.getValue();
      const appointment_time = fields.appointmentTime.getValue();
      const doctor_hospital = fields.doctorHospital.getValue();
      const helper_preference = fields.helperPreference.getValue();

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
        applyIstDateMin();
        clearAllFieldErrors();

        showMessage(
          messageEl,
          "Thank you! Your consultation request has been received. Our care advisor will contact you within 24 hours.",
          "success"
        );
      } catch (err) {
        console.error(err);
        // Keep all typed values; only surface the server error near the button.
        if (isPastAppointmentDbError(err)) {
          setFieldError(
            fields.appointmentTime,
            "Please choose a time later than now"
          );
          showMessage(
            messageEl,
            "That appointment time has already passed. Please choose a later date or time.",
            "error"
          );
          if (fields.appointmentTime.el) {
            fields.appointmentTime.el.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            fields.appointmentTime.el.focus();
          }
        } else if (isPincodeDbError(err)) {
          setFieldError(
            fields.pincode,
            "Please enter a valid 6-digit pincode"
          );
          showMessage(
            messageEl,
            "Please enter a valid 6-digit pincode",
            "error"
          );
          if (fields.pincode.el) {
            fields.pincode.el.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            fields.pincode.el.focus();
          }
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
