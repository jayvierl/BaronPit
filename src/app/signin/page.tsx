import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { safeReturnTo, signInHref } from "@/lib/signin-return";
import { SignInForm } from "./signin-form";

type Params = Record<string, string | string[] | undefined>;
const first = (value: Params[string]) => Array.isArray(value) ? value[0] : value;

export default async function SignInPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(first(params.next));
  const enrol = first(params.enrol) === "1";
  const initialSignup = first(params.mode) === "signup";
  const expired = first(params.error) === "expired";
  const session = enrol ? await getCurrentUser().catch(() => undefined) : null;
  if (enrol && session === null) redirect(signInHref(returnTo, initialSignup ? "signup" : undefined));
  if (enrol && session?.termsCurrent) redirect(returnTo);
  if (enrol && session === undefined) return (
    <section>
      <h1>Community eligibility</h1>
      <p role="alert">We couldn’t check your session. Refresh this page to try again.</p>
    </section>
  );
  const knownAgeBand = session?.ageBand ?? null;
  const accountId = session?.id;
  return <SignInForm key={JSON.stringify([returnTo, enrol, initialSignup, expired, accountId, knownAgeBand])}
    returnTo={returnTo} enrol={enrol} initialSignup={initialSignup} expired={expired} accountId={accountId} knownAgeBand={knownAgeBand}/>;
}
