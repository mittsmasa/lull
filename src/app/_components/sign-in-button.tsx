"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type SignInButtonProps = {
  callbackURL?: string;
};

export function SignInButton({ callbackURL }: SignInButtonProps) {
  const handleSignIn = () => {
    authClient.signIn.social({
      provider: "google",
      callbackURL: callbackURL ?? "/dashboard",
    });
  };

  return (
    <Button onClick={handleSignIn} className="tracking-wider">
      Google でサインイン
    </Button>
  );
}
