"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type SignInButtonProps = {
  callbackURL?: string;
};

export function SignInButton({ callbackURL }: SignInButtonProps) {
  const handleSignIn = () => {
    const target = callbackURL ?? "/dashboard";
    if (process.env.NEXT_PUBLIC_VERCEL_ENV === "preview") {
      authClient.signIn.oauth2({
        providerId: "google",
        callbackURL: target,
      });
      return;
    }
    authClient.signIn.social({
      provider: "google",
      callbackURL: target,
    });
  };

  return (
    <Button onClick={handleSignIn} className="tracking-wider">
      Google でサインイン
    </Button>
  );
}
