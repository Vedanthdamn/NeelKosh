"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { connectWallet, signMessage, NoWalletError } from "@/lib/wallet";
import { requestNonce, verifySignature, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";

export default function LoginPage() {
  const { session, setSession, hydrated } = useSession();
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && session) router.replace("/queue");
  }, [hydrated, session, router]);

  async function handleSignIn() {
    setConnecting(true);
    setError(null);
    try {
      const walletAddress = await connectWallet();
      const message = await requestNonce(walletAddress);
      const signature = await signMessage(message);
      const result = await verifySignature(walletAddress, signature);

      if (!result.registered || !result.user) {
        setError(
          `This wallet (${walletAddress}) isn't registered with NeelKosh yet. A verifier account has to be ` +
            "created before it can sign in here. Ask whoever administers the registry to register it."
        );
        return;
      }
      if (result.user.role !== "VERIFIER") {
        setError(
          `This wallet is registered as ${result.user.role}, not VERIFIER. Sign in with the wallet your ` +
            "verifier account uses, or ask an admin to check the role on this one."
        );
        return;
      }

      setSession({ token: result.token, user: result.user });
      router.push("/queue");
    } catch (err) {
      if (err instanceof NoWalletError) setError(err.message);
      else if (err instanceof ApiError) setError(err.message);
      else if (err instanceof Error && /rejected|denied/i.test(err.message)) setError("Wallet request was rejected.");
      else setError("Could not sign in. Check the browser console for details.");
      console.error(err);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-data text-xs tracking-[0.2em] text-slate-500 uppercase">NeelKosh</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-100">Verifier Portal</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in with the wallet holding your accredited VERIFIER role.
          </p>
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-6">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={connecting}
            className="w-full rounded bg-accent-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {connecting ? "Waiting on wallet…" : "Sign in with wallet"}
          </button>

          {error ? (
            <p className="mt-4 rounded border border-signal-red-500/30 bg-signal-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-signal-red-400">
              {error}
            </p>
          ) : null}

          <p className="mt-4 text-center text-xs text-slate-500">
            No transaction is sent. This only signs a one-time message to prove wallet control.
          </p>
        </div>
      </div>
    </div>
  );
}
