"use client";

import { useEffect, useState } from "react";

export function PurchaseFeedback({ message, success }: { message: string; success: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      setDismissed(true);
      const url = new URL(window.location.href);
      if (url.searchParams.get("purchase_result") === "created") {
        url.searchParams.delete("purchase_result");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [success]);

  if (dismissed) return null;
  return <p className={`purchase-message ${success ? "success" : "error"}`} role="status">{message}</p>;
}
