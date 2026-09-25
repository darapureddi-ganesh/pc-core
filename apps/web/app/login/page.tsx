"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(login, null);

  return (
    <main className="wrap" style={{ gridTemplateColumns: "1fr", maxWidth: 420 }}>
      <form className="card" action={formAction}>
        <span className="eyebrow">PC Core</span>
        <h2>Agent portal sign-in</h2>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoFocus />
        </div>

        {error && <div className="error">{error}</div>}

        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
