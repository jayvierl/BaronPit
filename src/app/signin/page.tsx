import { safeReturnTo } from "@/lib/signin-return";
import { SignInForm } from "./signin-form";

type Params = Record<string, string | string[] | undefined>;
const first = (value: Params[string]) => Array.isArray(value) ? value[0] : value;

export default async function SignInPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(first(params.next));
  const enrol = first(params.enrol) === "1";
  const initialSignup = first(params.mode) === "signup";
  const expired = first(params.error) === "expired";
  return <SignInForm key={JSON.stringify([returnTo, enrol, initialSignup, expired])}
    returnTo={returnTo} enrol={enrol} initialSignup={initialSignup} expired={expired}/>;
}
