import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInButton } from "@/app/_components/sign-in-button";
import { SkeletonBlock } from "@/app/_components/skeleton";
import { GuestInvitationLink } from "@/components/guest-invitation-link";
import { getSessionForRender, validateReturnTo } from "@/lib/session";

export default function Page(props: PageProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <h1 className="font-serif text-5xl font-light tracking-wide text-brand">
        Lull
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        ひとつの舞台を、もっとあたたかく
      </p>
      <GuestInvitationLink />
      <Suspense fallback={<SkeletonBlock className="h-9 w-44 rounded-md" />}>
        <SignInGate searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function SignInGate({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const session = await getSessionForRender();
  const { returnTo } = await searchParams;
  const callbackURL = validateReturnTo(returnTo);

  if (session) {
    redirect(callbackURL);
  }

  return <SignInButton callbackURL={callbackURL} />;
}
