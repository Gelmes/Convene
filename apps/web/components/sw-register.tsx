"use client";

import { useEffect } from "react";

/** Registers the service worker that makes visited pages work offline. */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: the app still works online without the SW.
      });
    }
  }, []);
  return null;
}
