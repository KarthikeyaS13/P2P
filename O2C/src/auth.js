export const AUTH_KEY = 'token';
export const USER_KEY = 'user';

export function login(token, user) {
  localStorage.setItem(AUTH_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = '/';
}

export function getToken() {
  return localStorage.getItem(AUTH_KEY);
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

/**
 * Checks if the stored JWT is present and not expired.
 * Decodes the payload without verifying the signature (that's the server's job).
 */
export function isAuthenticated() {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Check expiry (exp is in seconds)
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      // Token expired — clean up and return false
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(USER_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}




