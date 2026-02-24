"use client";

import { authClient } from "@/lib/auth-client";

export default function Page() {
  const handleSignIn = () => {
    authClient.signIn.social({ provider: "google" });
  };

  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <h1 className="text-primary text-4xl font-serif">Lull</h1>
      <button
        type="button"
        onClick={handleSignIn}
        className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Google でサインイン
      </button>
    </div>
  );
}
