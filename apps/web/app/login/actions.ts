"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, makeSessionToken, SESSION_COOKIE } from "../../lib/auth";

export async function login(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    return "Incorrect password.";
  }

  (await cookies()).set(SESSION_COOKIE, await makeSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
