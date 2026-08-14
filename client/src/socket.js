import io from 'socket.io-client';

// Single shared connection, reused across pages so switching between the
// upload form and a run's page doesn't tear down/reconnect the socket.
const socket = io({
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

export default socket;
