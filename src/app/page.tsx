import { redirect } from "next/navigation";
import { SignInButton } from "@/app/_components/sign-in-button";
import { getSession } from "@/lib/session";

export default async function Page() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <h1 className="font-serif text-5xl font-light tracking-wide text-primary">
        Lull
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        ピアノ発表会を、もっと美しく
      </p>
      <SignInButton />
    </div>
  );
}
