"use client";
import { useActionState, useState } from "react";
import { Button } from "../../components/ui";
import { authenticate } from "./actions";

export default function SignInForm({ local, google, next }: { local: boolean; google: boolean; next?: string }) {
  const [register, setRegister] = useState(false);
  const [error, action, pending] = useActionState(authenticate, "");
  return <>
    {google && <form action={action}><input type="hidden" name="next" value={next} /><Button className="full" variant={local ? "secondary" : "primary"} name="action" value="google" disabled={pending}>Continue with Google</Button></form>}
    {local && <form action={action} className="stack">
      <input name="next" value={next} type="hidden" />
      {register && <label>Name<input name="name" autoComplete="name" required maxLength={80} /></label>}
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={12} maxLength={128} required /></label>
      <Button variant="primary" disabled={pending} name="action" value={register ? "register" : "signin"}>{register ? "Create account" : "Sign in"}</Button>
      <Button type="button" variant="quiet" onClick={() => setRegister(!register)}>{register ? "Use an existing account" : "Create a local account"}</Button>
    </form>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </>;
}
