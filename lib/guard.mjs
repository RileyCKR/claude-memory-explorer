const LOOPBACK_BINDS = new Set(['127.0.0.1', 'localhost', '::1']);
const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

// A page on another site can point its own hostname at 127.0.0.1 (DNS rebinding)
// and then read this API as same-origin. Its requests still carry that hostname,
// so a loopback-bound server answers only to loopback names.
export function hostAllowed(hostHeader, bindHost) {
  if (!LOOPBACK_BINDS.has(bindHost)) return true;
  try {
    return LOOPBACK_NAMES.has(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
}
