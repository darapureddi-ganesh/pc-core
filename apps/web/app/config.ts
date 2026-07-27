// The client-visible twin of actions.ts's API base — used for plain <a> links
// to the API's HTML documents (schedule/certificate), which the browser should
// fetch directly rather than proxy through a server action. Keep in sync with
// the default in actions.ts; this demo assumes both run on localhost.
export const API_PUBLIC_BASE = "http://127.0.0.1:3000";
