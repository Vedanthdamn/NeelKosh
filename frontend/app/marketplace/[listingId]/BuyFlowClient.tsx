"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { EcosystemBadge } from "@/components/Badge";
import { useSession } from "@/lib/auth";
import {
  connectWallet,
  signMessage,
  getSigner,
  connectedChainId,
  getBrowserProvider,
  NoWalletError,
} from "@/lib/wallet";
import { simStablecoinContract, marketplaceContract, expectedChainId, marketplaceAddress } from "@/lib/contracts";
import {
  fetchListing,
  requestNonce,
  verifySignature,
  registerUser,
  claimFaucet,
  purchaseCredits,
  ApiError,
  type MarketplaceListing,
  type PurchaseResult,
} from "@/lib/api";
import { formatNKR, formatTonnes } from "@/lib/format";

export function BuyFlowClient({ listingId }: { listingId: string }) {
  const { session, setSession } = useSession();
  const [listing, setListing] = useState<MarketplaceListing | null | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [chainOk, setChainOk] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [chainBusy, setChainBusy] = useState<"faucet" | "approve" | "purchase" | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  useEffect(() => {
    fetchListing(listingId).then(setListing);
  }, [listingId]);

  useEffect(() => {
    if (listing && listing.amount > 0) setQuantity(Math.min(10, listing.amount));
  }, [listing]);

  const totalPrice = listing ? BigInt(listing.pricePerTonne) * BigInt(quantity || 0) : BigInt(0);

  async function refreshChainState(address: string) {
    const provider = getBrowserProvider();
    const [bal, allow] = await Promise.all([
      simStablecoinContract(provider).balanceOf(address) as Promise<bigint>,
      simStablecoinContract(provider).allowance(address, marketplaceAddress) as Promise<bigint>,
    ]);
    setBalance(bal);
    setAllowance(allow);
  }

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    connectedChainId()
      .then((chainId) => {
        if (cancelled) return;
        setChainOk(chainId === expectedChainId);
        if (chainId === expectedChainId) refreshChainState(session.user.walletAddress);
      })
      .catch(() => {
        if (!cancelled) setChainOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const walletAddress = await connectWallet();
      const message = await requestNonce(walletAddress);
      const signature = await signMessage(message);
      const verified = await verifySignature(walletAddress, signature);

      if (!verified.registered || !verified.user) {
        const registered = await registerUser("BUYER", verified.token);
        setSession({ token: registered.token, user: registered.user });
        return;
      }
      if (verified.user.role !== "BUYER") {
        setConnectError(
          `This wallet is registered as ${verified.user.role}, not a buyer. Connect a different wallet to purchase credits.`
        );
        return;
      }
      setSession({ token: verified.token, user: verified.user });
    } catch (err) {
      if (err instanceof NoWalletError) setConnectError(err.message);
      else if (err instanceof ApiError) setConnectError(err.message);
      else if (err instanceof Error && /rejected|denied/i.test(err.message)) setConnectError("Wallet request was rejected.");
      else setConnectError("Could not connect. Check the browser console for details.");
      console.error(err);
    } finally {
      setConnecting(false);
    }
  }

  async function handleFaucet() {
    if (!session) return;
    setChainBusy("faucet");
    setChainError(null);
    try {
      await claimFaucet(session.token);
      await refreshChainState(session.user.walletAddress);
    } catch (err) {
      setChainError(err instanceof ApiError ? err.message : "Faucet claim failed.");
    } finally {
      setChainBusy(null);
    }
  }

  async function handleApprove() {
    if (!session) return;
    setChainBusy("approve");
    setChainError(null);
    try {
      const signer = await getSigner();
      const tx = await simStablecoinContract(signer).approve(marketplaceAddress, totalPrice);
      await tx.wait();
      await refreshChainState(session.user.walletAddress);
    } catch (err) {
      setChainError(err instanceof Error ? describeChainError(err) : "Approval failed.");
    } finally {
      setChainBusy(null);
    }
  }

  async function handlePurchase() {
    if (!session) return;
    setChainBusy("purchase");
    setChainError(null);
    try {
      const purchase = await purchaseCredits(Number(listingId), quantity, session.token);
      setResult(purchase);
    } catch (err) {
      setChainError(err instanceof ApiError ? err.message : "Purchase failed.");
    } finally {
      setChainBusy(null);
    }
  }

  if (listing === undefined) {
    return (
      <div className="min-h-screen bg-mudflat-50">
        <SiteNav register="mudflat" />
        <div className="mx-auto max-w-2xl px-6 py-24 text-center text-ink-500">Loading…</div>
      </div>
    );
  }

  if (listing === null) {
    return (
      <div className="min-h-screen bg-mudflat-50 text-ink-900">
        <SiteNav register="mudflat" />
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <p className="font-display text-2xl font-medium">No listing #{listingId}</p>
          <Link href="/marketplace" className="mt-4 inline-block text-teal-600 underline underline-offset-2">
            Back to marketplace
          </Link>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-mudflat-50 text-ink-900">
        <SiteNav register="mudflat" />
        <div className="mx-auto flex max-w-xl flex-col items-center gap-5 px-6 py-24 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sand-500/20 text-2xl text-sand-700">✓</span>
          <h1 className="font-display text-3xl font-medium">Purchase complete</h1>
          <p className="text-ink-700">
            You bought <strong className="font-data">{formatTonnes(result.amount)}</strong> for{" "}
            <strong className="font-data">{formatNKR(result.totalPrice)}</strong>.
          </p>

          <div className="mt-2 w-full rounded-xl border border-mudflat-200 bg-white p-6 text-left">
            <p className="font-data text-xs uppercase tracking-wide text-ink-500">How the payment split</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-700">Implementing organisation</dt>
                <dd className="font-data font-medium text-ink-900">{formatNKR(result.ngoAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-700">Platform treasury</dt>
                <dd className="font-data font-medium text-ink-900">{formatNKR(result.platformAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-700">Community fund</dt>
                <dd className="font-data font-medium text-ink-900">{formatNKR(result.communityAmount)}</dd>
              </div>
            </dl>
          </div>

          <p className="font-data text-xs text-ink-500">tx {result.txHash}</p>

          <div className="mt-2 flex gap-3">
            <Link href="/my-credits" className="rounded-full bg-water-900 px-6 py-3 text-sm font-semibold text-mudflat-50 hover:bg-water-700">
              View my credits
            </Link>
            <Link
              href={`/verify/${result.tokenId}`}
              className="rounded-full border border-mudflat-200 px-6 py-3 text-sm font-semibold hover:bg-mudflat-200"
            >
              Verify this credit
            </Link>
          </div>
        </div>
        <SiteFooter register="mudflat" />
      </div>
    );
  }

  const needsFaucet = balance !== null && balance < totalPrice;
  const needsApproval = !needsFaucet && allowance !== null && allowance < totalPrice;
  const readyToBuy = balance !== null && allowance !== null && balance >= totalPrice && allowance >= totalPrice;

  return (
    <div className="min-h-screen bg-mudflat-50 text-ink-900">
      <SiteNav register="mudflat" />

      <div className="mx-auto max-w-2xl px-6 py-14">
        <Link href="/marketplace" className="text-sm text-ink-500 hover:text-ink-900">
          ← Marketplace
        </Link>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            {listing.project ? <EcosystemBadge ecosystem={listing.project.ecosystem} /> : null}
            <h1 className="mt-3 font-display text-3xl font-medium">
              {listing.project?.name ?? `Project #${listing.projectId}`}
            </h1>
            <p className="mt-1 text-ink-500">vintage {listing.vintage} · listing #{listing.listingId}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-mudflat-200 bg-white p-6">
          <div>
            <p className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Available</p>
            <p className="font-data text-lg font-medium">{formatTonnes(listing.amount)}</p>
          </div>
          <div className="text-right">
            <p className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Price per tonne</p>
            <p className="font-data text-lg font-medium">{formatNKR(listing.pricePerTonne)}</p>
          </div>
        </div>

        {!listing.active || listing.amount === 0 ? (
          <p className="mt-6 rounded-lg border border-coral-500/30 bg-coral-500/10 px-4 py-3 text-sm text-coral-600">
            This listing is no longer available — it was either fully sold or withdrawn by the seller.
          </p>
        ) : (
          <>
            <div className="mt-6 rounded-xl border border-mudflat-200 bg-white p-6">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Tonnes to buy</span>
                <input
                  type="number"
                  min={1}
                  max={listing.amount}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(listing.amount, Number(e.target.value) || 1)))}
                  className="font-data w-40 rounded-lg border border-mudflat-200 px-3 py-2 text-sm"
                />
              </label>
              <p className="mt-2 text-sm text-ink-500">
                Total: <span className="font-data font-medium text-ink-900">{formatNKR(totalPrice.toString())}</span>
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-mudflat-200 bg-white p-6">
              <p className="font-data text-xs uppercase tracking-wide text-ink-500">Buy flow</p>

              {!session ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting}
                    className="rounded-full bg-water-900 px-6 py-2.5 text-sm font-semibold text-mudflat-50 hover:bg-water-700 disabled:opacity-60"
                  >
                    {connecting ? "Connecting…" : "Connect wallet"}
                  </button>
                  {connectError ? <p className="mt-3 text-sm text-coral-600">{connectError}</p> : null}
                </div>
              ) : chainOk === false ? (
                <p className="mt-3 text-sm text-coral-600">
                  Your wallet is on the wrong network. Switch to chain id {expectedChainId.toString()} and reload this page.
                </p>
              ) : (
                <ol className="mt-4 space-y-4">
                  <Step done label={`Connected as ${session.user.walletAddress}`} />

                  <Step
                    done={!needsFaucet && balance !== null}
                    label={
                      balance === null
                        ? "Checking NKR balance…"
                        : `Balance: ${formatNKR(balance.toString())}`
                    }
                  >
                    {needsFaucet ? (
                      <button
                        type="button"
                        onClick={handleFaucet}
                        disabled={chainBusy !== null}
                        className="mt-2 rounded-full border border-teal-600 px-4 py-2 text-xs font-semibold text-teal-600 hover:bg-teal-600/10 disabled:opacity-60"
                      >
                        {chainBusy === "faucet" ? "Claiming…" : "Get NKR from faucet"}
                      </button>
                    ) : null}
                  </Step>

                  <Step
                    done={!needsApproval && !needsFaucet && allowance !== null}
                    label={
                      allowance === null
                        ? "Checking allowance…"
                        : `Marketplace approved for: ${formatNKR(allowance.toString())}`
                    }
                  >
                    {needsApproval ? (
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={chainBusy !== null}
                        className="mt-2 rounded-full border border-teal-600 px-4 py-2 text-xs font-semibold text-teal-600 hover:bg-teal-600/10 disabled:opacity-60"
                      >
                        {chainBusy === "approve" ? "Approving…" : `Approve ${formatNKR(totalPrice.toString())}`}
                      </button>
                    ) : null}
                  </Step>

                  <Step done={false} label="Confirm purchase">
                    <button
                      type="button"
                      onClick={handlePurchase}
                      disabled={!readyToBuy || chainBusy !== null}
                      className="mt-2 rounded-full bg-sand-500 px-6 py-2.5 text-sm font-semibold text-water-950 hover:bg-sand-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {chainBusy === "purchase" ? "Buying…" : `Buy ${formatTonnes(quantity)}`}
                    </button>
                  </Step>
                </ol>
              )}

              {chainError ? <p className="mt-4 text-sm text-coral-600">{chainError}</p> : null}
            </div>
          </>
        )}
      </div>

      <SiteFooter register="mudflat" />
    </div>
  );
}

function Step({ done, label, children }: { done: boolean; label: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          done ? "bg-teal-600 text-white" : "border border-mudflat-200 text-ink-500"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      <div className="text-sm">
        <p className={done ? "text-ink-900" : "text-ink-700"}>{label}</p>
        {children}
      </div>
    </li>
  );
}

/** ethers wraps a user-rejected transaction and a reverted one very differently — this narrows
 *  both down to one readable line instead of surfacing ethers' own verbose error shape. */
function describeChainError(err: Error): string {
  const anyErr = err as unknown as Record<string, unknown>;
  if (typeof anyErr.shortMessage === "string") return anyErr.shortMessage;
  if (/rejected|denied/i.test(err.message)) return "Transaction was rejected in your wallet.";
  return err.message;
}
