"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkPassword,
  clearFailedLogins,
  isLockedOut,
  makeSessionToken,
  recordFailedLogin,
  SESSION_COOKIE,
} from "../../lib/auth";

// Best-effort caller identity for the brute-force guard — trusts
// X-Forwarded-For, which only means something behind a reverse proxy that
// sets it itself. Good enough to throttle casual automated guessing against
// the shared portal password; not a strong identity.
async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
}

export async function login(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const key = await clientKey();
  if (isLockedOut(key)) {
    return "Too many attempts. Try again in a few minutes.";
  }

  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    recordFailedLogin(key);
    return "Incorrect password.";
  }
  clearFailedLogins(key);

  (await cookies()).set(SESSION_COOKIE, await makeSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // `secure` would reject the cookie entirely over plain HTTP, which is
    // exactly how local dev runs — only require it once there's real TLS.
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
