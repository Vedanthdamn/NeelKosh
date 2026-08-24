"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { PolygonDrawMap } from "@/components/PolygonDrawMap";
import { useSession } from "@/lib/auth";
import { connectWallet, signMessage, NoWalletError } from "@/lib/wallet";
import {
  ApiError,
  registerProject,
  requestNonce,
  verifySignature,
  registerUser,
  type Ecosystem,
  type LatLng,
} from "@/lib/api";
import { ECOSYSTEM_NAMES } from "@/lib/ecosystem";
import { polygonAreaHectares } from "@/lib/geo";
import { formatNumber, truncateAddress } from "@/lib/format";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

interface FormErrors {
  name?: string;
  ecosystem?: string;
  implementerAddress?: string;
  boundary?: string;
}

export default function RegisterPage() {
  const { session, setSession } = useSession();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ecosystem, setEcosystem] = useState<Ecosystem | "">("");
  const [implementerAddress, setImplementerAddress] = useState("");
  const [description, setDescription] = useState("");
  const [story, setStory] = useState("");
  const [photosText, setPhotosText] = useState("");
  const [boundary, setBoundary] = useState<LatLng[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ projectId: number; registrationTxHash: string } | null>(null);

  const areaHectares = useMemo(() => polygonAreaHectares(boundary), [boundary]);

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!name.trim()) next.name = "Give the project a name.";
    if (!ecosystem) next.ecosystem = "Pick the ecosystem being restored.";
    if (!ADDRESS_PATTERN.test(implementerAddress.trim())) {
      next.implementerAddress = "Enter a valid Ethereum address (0x followed by 40 hex characters).";
    }
    if (boundary.length < 3) next.boundary = "Click at least 3 points on the map to enclose the site.";
    return next;
  }

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const walletAddress = await connectWallet();
      const message = await requestNonce(walletAddress);
      const signature = await signMessage(message);
      const verified = await verifySignature(walletAddress, signature);

      if (!verified.registered || !verified.user) {
        const registered = await registerUser("NGO", verified.token);
        setSession({ token: registered.token, user: registered.user });
        return;
      }
      if (verified.user.role !== "NGO") {
        setConnectError(
          `This wallet is registered as ${verified.user.role}, not NGO. Connect a different wallet to register a project.`
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const photos = photosText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const response = await registerProject(
        {
          name: name.trim(),
          ecosystem: ecosystem as Ecosystem,
          implementerAddress: implementerAddress.trim(),
          boundary,
          description: description.trim() || undefined,
          story: story.trim() || undefined,
          photos: photos.length > 0 ? photos : undefined,
        },
        session.token
      );
      setResult({ projectId: response.projectId, registrationTxHash: response.registrationTxHash });
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : "Something went wrong registering this project.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="min-h-screen bg-mudflat-50 text-ink-900">
        <SiteNav register="mudflat" />
        <div className="mx-auto flex max-w-xl flex-col items-center gap-5 px-6 py-24 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sand-500/20 text-2xl text-sand-700">
            ✓
          </span>
          <h1 className="font-display text-3xl font-medium">Project registered</h1>
          <p className="text-ink-700">
            <strong className="font-data">{name}</strong> is now on chain as project #{result.projectId}.
          </p>
          <p className="font-data text-xs text-ink-500">tx {result.registrationTxHash}</p>
          <div className="mt-2 flex gap-3">
            <Link
              href={`/projects/${result.projectId}`}
              className="rounded-full bg-water-900 px-6 py-3 text-sm font-semibold text-mudflat-50 hover:bg-water-700"
            >
              View project
            </Link>
            <Link href="/projects" className="rounded-full border border-mudflat-200 px-6 py-3 text-sm font-semibold hover:bg-mudflat-200">
              All projects
            </Link>
          </div>
        </div>
        <SiteFooter register="mudflat" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mudflat-50 text-ink-900">
      <SiteNav register="mudflat" />

      <section className="mx-auto max-w-6xl px-6 pt-14 pb-6">
        <p className="font-data text-xs uppercase tracking-[0.2em] text-teal-600">Register a project</p>
        <h1 className="mt-3 font-display text-4xl font-medium sm:text-5xl">Put a restoration site on the record</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-700">
          This writes directly to ProjectRegistry on chain. Once registered, the project&rsquo;s
          boundary and implementer are permanent, and only status can change later.
        </p>
      </section>

      {!session ? (
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-xl border border-mudflat-200 bg-white p-8 text-center">
            <p className="mb-4 text-sm text-ink-700">
              Registration is gated to the NGO role. Connect the wallet your organisation signs in with.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="rounded-full bg-water-900 px-6 py-3 text-sm font-semibold text-mudflat-50 hover:bg-water-700 disabled:opacity-60"
            >
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
            {connectError ? <p className="mt-4 text-sm text-coral-600">{connectError}</p> : null}
          </div>
        </section>
      ) : (
        <>
          <p className="font-data mx-auto max-w-6xl px-6 text-xs text-ink-500">
            connected as {truncateAddress(session.user.walletAddress)}
          </p>

          <form onSubmit={handleSubmit} className="mx-auto max-w-6xl px-6 pt-4 pb-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <Field label="Project name" error={errors.name}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Chilika Lagoon Seagrass Restoration, Odisha"
                className="w-full rounded-lg border border-mudflat-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500"
              />
            </Field>

            <Field label="Ecosystem" error={errors.ecosystem}>
              <select
                value={ecosystem}
                onChange={(event) => setEcosystem(event.target.value as Ecosystem)}
                className="w-full rounded-lg border border-mudflat-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500"
              >
                <option value="">Select an ecosystem</option>
                {ECOSYSTEM_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Implementing organisation's wallet address"
              error={errors.implementerAddress}
              hint="The organisation accountable for this project, and who receives issued credits."
            >
              <input
                value={implementerAddress}
                onChange={(event) => setImplementerAddress(event.target.value)}
                placeholder="0x..."
                className="font-data w-full rounded-lg border border-mudflat-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500"
              />
            </Field>

            <Field label="Description" hint="Optional. Shown on the project's card and detail page.">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-mudflat-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500"
              />
            </Field>

            <Field label="Story" hint="Optional. The longer context: who's involved, how it started.">
              <textarea
                value={story}
                onChange={(event) => setStory(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-mudflat-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500"
              />
            </Field>

            <Field label="Photo URLs" hint="Optional. One per line.">
              <textarea
                value={photosText}
                onChange={(event) => setPhotosText(event.target.value)}
                rows={2}
                placeholder="https://..."
                className="font-data w-full rounded-lg border border-mudflat-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-3">
            <Field label="Boundary" error={errors.boundary} hint="Click the map to place at least 3 points, in order, around the site.">
              <div className="h-[420px] overflow-hidden rounded-xl border border-mudflat-200">
                <PolygonDrawMap points={boundary} onAddPoint={(point) => setBoundary((prev) => [...prev, point])} />
              </div>
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-mudflat-200 bg-white px-4 py-3">
              <p className="font-data text-sm text-ink-700">
                {boundary.length} point{boundary.length === 1 ? "" : "s"}
                {boundary.length >= 3 ? ` · ~${formatNumber(Math.round(areaHectares))} ha` : ""}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBoundary((prev) => prev.slice(0, -1))}
                  disabled={boundary.length === 0}
                  className="rounded-full border border-mudflat-200 px-3 py-1.5 text-xs font-semibold hover:bg-mudflat-200 disabled:opacity-40"
                >
                  Undo last point
                </button>
                <button
                  type="button"
                  onClick={() => setBoundary([])}
                  disabled={boundary.length === 0}
                  className="rounded-full border border-mudflat-200 px-3 py-1.5 text-xs font-semibold hover:bg-mudflat-200 disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>

        {submitError ? (
          <p className="mt-8 rounded-lg border border-coral-500/30 bg-coral-500/10 px-4 py-3 text-sm text-coral-600">
            {submitError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-8 rounded-full bg-water-900 px-8 py-3.5 text-sm font-semibold text-mudflat-50 transition-colors hover:bg-water-700 disabled:opacity-60"
        >
          {submitting ? "Registering on chain…" : "Register project"}
        </button>
          </form>
        </>
      )}

      <SiteFooter register="mudflat" />
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-900">{label}</span>
      {children}
      {hint && !error ? <span className="text-xs text-ink-500">{hint}</span> : null}
      {error ? <span className="text-xs text-coral-600">{error}</span> : null}
    </label>
  );
}
