import io from 'socket.io-client';

// Single shared connection, reused across pages so switching between the
// upload form and a run's page doesn't tear down/reconnect the socket.
//
// Deliberately not overriding `transports` (default is polling first,
// upgrading to websocket) - starting on websocket only works if every hop
// (Cloudflare's zone-level WebSockets setting included) supports the
// upgrade, and retries stay stuck on the same broken transport otherwise.
const socket = io({
  path: '/socket.io',
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

export default socket;
