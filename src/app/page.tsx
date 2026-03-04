import { redirect } from "next/navigation";
import { SignInButton } from "@/app/_components/sign-in-button";
import { getSession, validateReturnTo } from "@/lib/session";

export default async function Page(props: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await getSession();
  const { returnTo } = await props.searchParams;
  const callbackURL = validateReturnTo(returnTo);

  if (session) {
    redirect(callbackURL);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <h1 className="font-serif text-5xl font-light tracking-wide text-primary">
        Lull
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        ひとつの舞台を、もっとあたたかく
      </p>
      <SignInButton callbackURL={callbackURL} />
    </div>
  );
}
