import { redirect } from "next/navigation";
import { SignInButton } from "@/app/_components/sign-in-button";
import { GuestInvitationLink } from "@/components/guest-invitation-link";
import { getSession, validateReturnTo } from "@/lib/session";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function Page(props: PageProps<"/">) {
  const session = await getSession();
  const { returnTo } = await props.searchParams;
  const callbackURL = validateReturnTo(returnTo);

  if (session) {
    redirect(callbackURL);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <h1 className="font-serif text-5xl font-light tracking-wide text-brand">
        Lull
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        ひとつの舞台を、もっとあたたかく
      </p>
      <GuestInvitationLink />
      <SignInButton callbackURL={callbackURL} />
    </div>
  );
}
