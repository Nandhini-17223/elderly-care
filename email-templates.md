# ABI Parent Care – Email Templates (approved)

Source of truth for all automated emails and helper on-screen messages.
Placeholders in double braces are filled per request.

## Global rules

- Branded HTML layout: ABI Parent Care logo/name and site colours in the header, reference number top right, one main button per email, plain-text alternative for every email.
- First line = what happened; second = what to do.
- Patient's FULL name ({{parent_name}}) everywhere, including subjects.
- Dates show both forms, e.g. "Tomorrow, 13 Nov 2026 · 10:00 AM" or "Today · in 1 hour" ({{relative_time}}), Asia/Kolkata.
- Helpers never see patient name, address or family contact before accepting (H1).
- Footer on every email: "This is an automated message from ABI Parent Care. For help, call {{support_phone}}."
- {{support_phone}} = +91 73399 11220
- Sender: ABI Parent Care <onboarding@resend.dev> for now (domain later). Reply-to: not set yet (decided later).
- Language: English.
- {{ref}} = request reference number, format ABI-1042 (auto sequence, starting ABI-1001).

---

## Guardian emails

### G1 · Request received (after form submit)

Subject: We've received your request – {{parent_name}}, {{appointment_date_short}} · Ref {{ref}}

Dear {{booking_person_name}},

Thank you for choosing ABI Parent Care. We've received your request for {{parent_name}}'s doctor appointment.

APPOINTMENT
Date & time: {{appointment_date_long}} · {{appointment_time}}
Doctor/Hospital: {{doctor_hospital}}
Pickup from: {{area}}, {{city}} {{pincode}}
Helper preference: {{helper_preference_label}}

WHAT HAPPENS NEXT
We're matching a verified helper near you. As soon as a helper is confirmed, we'll email you their name, photo and phone number.

Need to change anything? Call us on {{support_phone}} and quote Ref {{ref}}.

Warm regards,
The ABI Parent Care team

### G2 · We're arranging a helper (once, when request becomes needs_senior)

Subject: Update on {{parent_name}}'s appointment – {{appointment_date_short}} · Ref {{ref}}

Dear {{booking_person_name}},

A quick update: our care team is personally arranging a suitable helper for {{parent_name}}'s appointment on {{appointment_date_long}} at {{appointment_time}}.

You don't need to do anything. We'll email you the helper's details shortly.

If you'd like to speak to us, call {{support_phone}} and quote Ref {{ref}}.

Warm regards,
The ABI Parent Care team

### G3 · Your helper is confirmed (helper accepts)

Subject: Helper confirmed for {{parent_name}} – {{helper_full_name}}, {{appointment_date_short}} · Ref {{ref}}

Dear {{booking_person_name}},

Good news – {{helper_full_name}} will accompany {{parent_name}} to the appointment.

[Helper photo]

YOUR HELPER
Name: {{helper_full_name}}
Phone: {{helper_phone}}
Verified: ID and background checked by ABI Parent Care

APPOINTMENT
Date & time: {{appointment_date_long}} · {{appointment_time}} ({{relative_time}})
Doctor/Hospital: {{doctor_hospital}}
Pickup from: {{address_line1}}, {{street}}, {{area}}, {{city}} {{pincode}}

For safety, please share this with {{parent_name}} so they know who to expect.

Warm regards,
The ABI Parent Care team

### G4 · Your helper can't attend (drop-out, or manager "unable – reassign")

Subject: Change of helper for {{parent_name}} – {{appointment_date_short}} · Ref {{ref}}

Dear {{booking_person_name}},

We're sorry – {{old_helper_first_name}} is unable to attend {{parent_name}}'s appointment on {{appointment_date_long}} at {{appointment_time}}.

Our care team is arranging a replacement as a priority. We'll email you the new helper's details as soon as they're confirmed.

The appointment itself is unchanged. If you have concerns, call {{support_phone}} and quote Ref {{ref}}.

Warm regards,
The ABI Parent Care team

### G5 · Your new helper (replacement accepts)

Subject: New helper confirmed for {{parent_name}} – {{helper_full_name}} · Ref {{ref}}

Dear {{booking_person_name}},

{{helper_full_name}} will now accompany {{parent_name}} to the appointment, in place of {{old_helper_first_name}}.

[Helper photo]

YOUR NEW HELPER
Name: {{helper_full_name}}
Phone: {{helper_phone}}
Verified: ID and background checked by ABI Parent Care

APPOINTMENT (unchanged)
Date & time: {{appointment_date_long}} · {{appointment_time}} ({{relative_time}})
Doctor/Hospital: {{doctor_hospital}}

Thank you for your patience.

Warm regards,
The ABI Parent Care team

---

## Helper emails

### H1 · New visit near you (offer; NO patient name/address/contact)

Subject: New visit near you – {{appointment_date_short}}, {{appointment_time}} · {{area}} ({{distance_km}} km)

Hi {{helper_first_name}},

A new hospital visit is available near you. The first helper to accept gets it.

When: {{appointment_date_long}} · {{appointment_time}} ({{relative_time}})
Pickup area: {{area}}, {{pincode}} · about {{distance_km}} km from you
Hospital: {{doctor_hospital}}
Patient: Age {{parent_age}}

[ Accept ]   [ Decline ]

The patient's name, full address and family contact are shared after you accept.

Ref {{ref}}

### H2 · Appointment confirmed (to accepting helper)

Subject: Confirmed: {{parent_name}}, {{appointment_date_short}} {{appointment_time}} · Ref {{ref}}

Hi {{helper_first_name}},

This visit is yours. Thank you!

PATIENT
Name: {{parent_name}}, {{parent_age}}
Pickup: {{address_line1}}, {{street}}, {{area}}, {{city}} {{pincode}}
Landmark: {{landmark}}
[ Open in Google Maps ]

APPOINTMENT
When: {{appointment_date_long}} · {{appointment_time}} ({{relative_time}})
Hospital: {{doctor_hospital}}

FAMILY CONTACT
{{booking_person_name}} ({{relationship}}) · {{guardian_phone}}

We'll remind you 12 hours and 6 hours before.

Can't make it? Tell us as early as possible: [ Can't make it ]

Ref {{ref}}

### H3 · Reminder: 12 hours to go

Subject: Reminder: visit {{relative_time}} {{appointment_time}} – {{parent_name}}, {{area}}

Hi {{helper_first_name}},

A reminder that you're accompanying {{parent_name}} {{relative_time}}.

When: {{appointment_date_long}} · {{appointment_time}}
Pickup: {{full_address}} · [ Open in Google Maps ]
Hospital: {{doctor_hospital}}
Family: {{booking_person_name}} ({{relationship}}) · {{guardian_phone}}

Plan to reach the pickup address 15 minutes early.

Can't make it? [ Can't make it ]

Ref {{ref}}

### H4 · Reminder: 6 hours to go – please confirm

Subject: Please confirm: {{parent_name}} at {{appointment_time}} – {{relative_time}}

Hi {{helper_first_name}},

Your visit with {{parent_name}} is {{relative_time}}. Please confirm you'll be there.

[ I'll be there ]      [ Can't make it ]

When: {{appointment_date_long}} · {{appointment_time}}
Pickup: {{full_address}} · [ Open in Google Maps ]
Hospital: {{doctor_hospital}}
Family: {{booking_person_name}} ({{relationship}}) · {{guardian_phone}}

If we don't hear from you, our care team will call you.

Ref {{ref}}

### H5 · Your ABI Helper login (when manager creates login)

Subject: Welcome to ABI Parent Care – your helper app login

Hi {{helper_first_name}},

Welcome to the ABI Parent Care team! Your profile is verified and your helper app account is ready.

App link: {{helper_app_link}}
Login email: {{helper_email}}
Password: the temporary password given to you by your manager

You'll be asked to set your own password the first time you log in.

Tip: open the link on your phone and choose "Add to Home screen" to use it like an app.

Questions? Call {{support_phone}}.

The ABI Parent Care team

---

## Manager emails (to SENIOR_EMAIL; buttons link to the /admin/ portal, login required)

### M1 · URGENT: short-notice booking (< 4 hours)

Subject: URGENT – Helper needed in {{time_remaining}} · {{parent_name}} ({{parent_age}}) · {{appointment_time}} · {{area}} · {{ref}}

Hi {{manager_first_name}},

A booking has come in for {{relative_time}}. There isn't time to send offers automatically, so please assign a helper now.

WHAT TO DO NOW
Open the request, pick an available helper and send them an offer.

VISIT DETAILS
Patient: {{parent_name}}, {{parent_age}}
When: {{appointment_date_long}} · {{appointment_time}} ({{relative_time}})
Pickup: {{area}}, {{city}} {{pincode}}
Hospital: {{doctor_hospital}}
Preference: {{helper_preference_label}}
Family: {{booking_person_name}} ({{relationship}}) · {{guardian_phone}}

[ Assign a helper ]

### M2 · Requests needing a helper (10 AM, 1 PM, 4 PM, 7 PM; skip if none)

Subject: {{count}} request(s) need a helper – {{digest_time}}

Hi {{manager_first_name}},

These requests still need a helper. The soonest appointment is first.

1. {{ref}} · {{parent_name}} ({{parent_age}}) · {{appointment_date_short}} {{appointment_time}} ({{relative_time}})
   {{area}} {{pincode}} · Preference: {{helper_preference_label}}
   Why: {{reason_plain}}   [ Assign ]
2. ...

[ Open all in the portal ]

Plain-language reasons:
- no_acceptance → "No helper accepted within 2 hours"
- no_suitable_helpers → "No suitable helper nearby"
- all_declined → "All offered helpers declined"
- short_notice → "Booked at short notice"
- helper_dropped → "Helper dropped out"
- helper_not_confirmed → "Helper didn't confirm"
- helper_unavailable → "Helper no longer available"

### M3 · Helper declined your offer

Subject: {{helper_full_name}} declined – please assign another · {{parent_name}}, {{appointment_date_short}} {{appointment_time}} · {{ref}}

Hi {{manager_first_name}},

{{helper_full_name}} declined the visit you offered.
Reason given: {{decline_reason_or_none}}

Appointment: {{appointment_date_long}} · {{appointment_time}} ({{relative_time}}) · {{area}}

[ Choose another helper ]

### M4 · Helper didn't respond to your offer (expired)

Subject: No response from {{helper_full_name}} – please assign another · {{parent_name}} · {{ref}}

Hi {{manager_first_name}},

{{helper_full_name}} didn't respond within {{expiry_window}}, so the offer has been withdrawn.

Appointment: {{appointment_date_long}} · {{appointment_time}} ({{relative_time}}) · {{area}}
Helper phone (if you'd like to call): {{helper_phone}}

[ Choose another helper ]

### M5 · URGENT: helper dropped out

Subject: URGENT – {{helper_full_name}} can't attend · {{parent_name}} · {{appointment_time}} ({{relative_time}}) · {{ref}}

Hi {{manager_first_name}},

{{helper_full_name}} has said they can't attend this visit.
Reason given: {{dropout_reason_or_none}}

The family has been told we're arranging a replacement. Please assign a new helper now.

VISIT DETAILS
Patient: {{parent_name}}, {{parent_age}}
When: {{appointment_date_long}} · {{appointment_time}} ({{relative_time}})
Pickup: {{area}}, {{city}} {{pincode}}
Hospital: {{doctor_hospital}}
Family: {{booking_person_name}} ({{relationship}}) · {{guardian_phone}}

[ Assign a replacement ]

### M6 · Helper hasn't confirmed (3 hours before; family NOT told)

Subject: Action needed – {{helper_full_name}} hasn't confirmed · {{parent_name}} · {{appointment_time}} ({{relative_time}}) · {{ref}}

Hi {{manager_first_name}},

{{helper_full_name}} hasn't yet confirmed they'll attend this visit. The family has not been informed.

WHAT TO DO NOW
1. Call {{helper_first_name}}: {{helper_phone}}
2. Then in the portal, choose:
   • Helper confirmed by phone – nothing else happens, or
   • Helper unable – reassign – we'll inform the family and you can pick a new helper

VISIT DETAILS
Patient: {{parent_name}}, {{parent_age}}
When: {{appointment_date_long}} · {{appointment_time}} ({{relative_time}})
Pickup: {{area}}, {{city}} {{pincode}}
Hospital: {{doctor_hospital}}

HELPER STATUS
Assigned: {{assigned_at}}
Reminders: 12-hour {{r12_status}} · 6-hour {{r6_status}}
Confirmed: Not yet

[ Open request ]

### M7 · URGENT: still not confirmed (1 hour before; only if M6 unresolved)

Subject: URGENT – visit in 1 hour, {{helper_full_name}} still not confirmed · {{parent_name}} · {{ref}}

Hi {{manager_first_name}},

The visit starts in about 1 hour and {{helper_full_name}} still hasn't confirmed. Please resolve this now.

1. Call {{helper_first_name}}: {{helper_phone}}
2. Mark "Helper confirmed by phone", or choose "Helper unable – reassign".

(Then the same VISIT DETAILS and HELPER STATUS blocks as M6.)

[ Open request ]

### M8 · Driving licence expiring (30 days, 7 days, on expiry; drivers only)

Subject: Driving licence {{expiry_phrase}} – {{helper_full_name}}
({{expiry_phrase}} = "expires in 30 days" / "expires in 7 days" / "has expired")

Hi {{manager_first_name}},

{{helper_full_name}}'s driving licence {{expiry_phrase}} ({{dl_expiry}}).

If expired: They've been paused and won't receive offers until a renewed licence is recorded. Upcoming visits: {{upcoming_count}} (moved to Needs action).
If not yet expired: Please ask them for the renewed licence before this date to avoid a pause.

[ Open helper profile ]

### M9 · Helper profile change request

Subject: Profile change request – {{helper_full_name}}

Hi {{manager_first_name}},

{{helper_full_name}} has asked to update their profile:

"{{request_note}}"

Please review and update their details in the portal if appropriate.

[ Open helper profile ]

---

## On-screen messages (respond.html and action pages)

| Situation | Title | Message |
| --- | --- | --- |
| Before confirming Accept | Accept this visit? | {{appointment_date_short}} · {{appointment_time}} · {{area}}. Tap Confirm to take this visit. |
| Accepted | This visit is yours! | We've emailed you the full details. Thank you, {{helper_first_name}}. |
| Someone else was faster | Already taken | Another helper accepted this visit first. Thank you for responding quickly. |
| Helper is now busy | You're already booked | You have another visit around this time, so we can't assign this one to you. |
| Declined | Thanks for letting us know | We've offered this visit to another helper. |
| Confirmed attendance | See you there! | Thanks for confirming. The family is counting on you. |
| Can't make it (before submitting) | Can't make this visit? | Tell us why (optional), then tap Confirm. We'll arrange a replacement. |
| Can't make it (done) | Thanks for telling us | Our care team will arrange a replacement. |
| Link expired or already used | This link is no longer active | The visit may have been assigned, cancelled or already passed. Please contact your manager if you need help. |
