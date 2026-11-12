(function (global) {
  const SUPABASE_URL = "https://vzmhcqhcvflylmobpvap.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6bWhjcWhjdmZseWxtb2JwdmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQ1MDMsImV4cCI6MjEwODc0MDUwM30.hGkhLLJ9pmtVbfLaGv5PXnkuZIwXZe9pMbVUGBiKOKw";
  const IST = "Asia/Kolkata";
  const STAFF_ROLES = ["super_admin", "manager"];
  const SUPER_ADMIN_ONLY = ["audit.html", "staff.html", "settings.html"];

  global.AdminConfig = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    IST: IST,
    STAFF_ROLES: STAFF_ROLES,
    SUPER_ADMIN_ONLY: SUPER_ADMIN_ONLY,
    FUNCTIONS_BASE: SUPABASE_URL + "/functions/v1",
  };
})(window);
