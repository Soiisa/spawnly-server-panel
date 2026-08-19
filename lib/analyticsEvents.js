// lib/analyticsEvents.js
// Shared between the browser tracker and the ingest route so a typo in a
// component can't quietly create a new event name that never shows up in the
// funnel. Add new names here first.

export const EVENTS = {
  PAGE_VIEW: 'page_view',

  // --- Signup / login ---
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  SIGNUP_FAILED: 'signup_failed',
  LOGIN_COMPLETED: 'login_completed',
  LOGIN_FAILED: 'login_failed',

  // --- Dashboard / onboarding ---
  DASHBOARD_VIEWED: 'dashboard_viewed',
  USERNAME_PROMPT_SHOWN: 'username_prompt_shown',
  USERNAME_SAVED: 'username_saved',
  TOUR_STARTED: 'tour_started',
  TOUR_FINISHED: 'tour_finished',

  // --- Create server ---
  CREATE_MODAL_OPENED: 'create_modal_opened',
  CREATE_MODAL_ABANDONED: 'create_modal_abandoned',
  CREATE_SERVER_SUBMITTED: 'create_server_submitted',
  CREATE_SERVER_SUCCEEDED: 'create_server_succeeded',
  CREATE_SERVER_FAILED: 'create_server_failed',

  // --- Start server ---
  SERVER_START_CLICKED: 'server_start_clicked',
  SERVER_START_ACCEPTED: 'server_start_accepted',
  SERVER_START_FAILED: 'server_start_failed',
  SERVER_RUNNING: 'server_running',
  SERVER_PROVISION_FAILED: 'server_provision_failed',
  SERVER_DELETED: 'server_deleted',

  // --- Money ---
  CREDITS_VIEWED: 'credits_viewed',
  TOPUP_STARTED: 'topup_started',
  TOPUP_COMPLETED: 'topup_completed',
  TOPUP_FAILED: 'topup_failed',
};

export const ALLOWED_EVENTS = new Set(Object.values(EVENTS));

// The ordered funnel rendered on /admin/funnel.
export const FUNNEL_STEPS = [
  { event: EVENTS.SIGNUP_COMPLETED, label: 'Signed up' },
  { event: EVENTS.DASHBOARD_VIEWED, label: 'Reached dashboard' },
  { event: EVENTS.CREATE_MODAL_OPENED, label: 'Opened create form' },
  { event: EVENTS.CREATE_SERVER_SUCCEEDED, label: 'Created a server' },
  { event: EVENTS.SERVER_START_CLICKED, label: 'Clicked start' },
  { event: EVENTS.SERVER_RUNNING, label: 'Server running' },
];
