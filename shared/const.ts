export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
// T-84: what every protected procedure throws until an account holder has replaced the password
// an admin set for them. The client keys on this string to route to its change-password screen.
export const PASSWORD_CHANGE_REQUIRED_MESSAGE = 'Password change required';
