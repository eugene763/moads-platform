"use client";

import {useEffect, useState} from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: "accepted" | "dismissed"; platform: string}>;
}

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMessage(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  async function handleInstall(): Promise<void> {
    if (!installPrompt) {
      setMessage("Use your browser menu to add this app to your desktop.");
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  }

  return (
    <div className="install-cta-wrap">
      <button type="button" className="cta-ghost desktop-install-cta" onClick={() => void handleInstall()}>
        Install AEO Checker
      </button>
      {message ? <p className="tiny install-cta-message">{message}</p> : null}
    </div>
  );
}
