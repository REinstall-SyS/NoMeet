import { Brand } from "../../components/ui";
import { localAuthAvailable } from "../../auth";
import SignInForm from "./form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <main className="auth-screen"><Brand /><section className="card auth-card stack">
    <div><h1>Sign in to NoMeet</h1><p className="muted">Access your team’s updates and open work.</p></div>
    {error && <p className="form-error" role="alert">Sign-in could not be completed. Please try again.</p>}
    <SignInForm local={localAuthAvailable()} google={!!process.env.AUTH_GOOGLE_ID} next={next} />
  </section></main>;
}
