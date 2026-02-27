"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  const handleSignIn = () => {
    authClient.signIn.social({ provider: "google" });
  };

  return <Button onClick={handleSignIn}>Google でサインイン</Button>;
}
