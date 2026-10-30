"use client";

import { io } from "socket.io-client";
import { getToken } from "./api";

/** Socket for the live classroom namespace. The caller owns its lifetime. */
export function classroomSocket() {
  return io("/classroom", {
    path: "/socket.io",
    auth: { token: getToken() },
    transports: ["websocket", "polling"],
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
}

/** Promise wrapper around socket.emit(event, payload, ack). */
export function request(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(10000).emit(event, payload ?? {}, (err, res) => {
      if (err) return reject(new Error("The class did not respond. Check your connection."));
      if (res?.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
}

/** Socket for live quizzes. The caller owns its lifetime. */
export function quizSocket() {
  return io("/quiz", {
    path: "/socket.io",
    auth: { token: getToken() },
    transports: ["websocket", "polling"],
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
}
