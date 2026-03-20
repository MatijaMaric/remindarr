import webpush from "web-push";
import { CONFIG } from "../config";
import { getSetting, setSetting } from "../db/repository";
import { logger } from "../logger";

const log = logger.child({ module: "vapid" });

interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export async function getVapidKeys(): Promise<VapidKeys> {
  // Priority: env vars > settings table > auto-generate
  let publicKey = CONFIG.VAPID_PUBLIC_KEY;
  let privateKey = CONFIG.VAPID_PRIVATE_KEY;
  let subject = CONFIG.VAPID_SUBJECT;

  if (!publicKey || !privateKey) {
    // Try settings table
    publicKey = await getSetting("vapid_public_key") || "";
    privateKey = await getSetting("vapid_private_key") || "";
    subject = subject || await getSetting("vapid_subject") || "";
  }

  if (!publicKey || !privateKey) {
    // Auto-generate and persist
    log.info("Generating new VAPID keys");
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await setSetting("vapid_public_key", publicKey);
    await setSetting("vapid_private_key", privateKey);
  }

  if (!subject) {
    subject = "mailto:noreply@remindarr.local";
    if (!CONFIG.VAPID_SUBJECT && !await getSetting("vapid_subject")) {
      await setSetting("vapid_subject", subject);
    }
  }

  return { publicKey, privateKey, subject };
}

export async function getVapidPublicKey(): Promise<string> {
  const keys = await getVapidKeys();
  return keys.publicKey;
}
