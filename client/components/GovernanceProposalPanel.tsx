"use client";

import React from "react";

type TreasuryAccountRow = {
  pubkey: string;
  mint: string;
  owner: string;
  amount: string;
  decimals: number;
  uiAmountString: string;
};

type TreasuryGroup = {
  governance: string;
  nativeTreasury: string;
  tokenAccounts: TreasuryAccountRow[];
};

type Props = {
  proposalName: string;
  proposalDescription: string;
  realmAddress: string;
  governanceProgramId: string;
  governanceAddress: string;
  treasuryGroups: TreasuryGroup[];
  selectedTreasuryGroup: string;
  selectedTreasuryAccount: string;
  loadingTreasuries: boolean;
  realmCommunityMint: string;

  onProposalNameChange: (v: string) => void;
  onProposalDescriptionChange: (v: string) => void;
  onRealmAddressChange: (v: string) => void;
  onGovernanceProgramIdChange: (v: string) => void;
  onSelectedTreasuryGroupChange: (v: string) => void;
  onSelectedTreasuryAccountChange: (v: string) => void;
  onLoadTreasuries: () => void;
  onUseRealms: () => void;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-white/40">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none " +
  "placeholder:text-white/30 transition focus:border-fuchsia-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-fuchsia-500/20";

const textareaClass =
  "min-h-[110px] w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none " +
  "placeholder:text-white/30 transition focus:border-fuchsia-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-fuchsia-500/20";
  

const buttonClass =
  "inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/85 transition hover:bg-white/[0.07] hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50";

export default function GovernanceProposalPanel({
  proposalName,
  proposalDescription,
  realmAddress,
  governanceProgramId,
  realmCommunityMint, // add this
  treasuryGroups,
  selectedTreasuryGroup,
  selectedTreasuryAccount,
  loadingTreasuries,
  onProposalNameChange,
  onProposalDescriptionChange,
  onRealmAddressChange,
  onGovernanceProgramIdChange,
  onSelectedTreasuryGroupChange,
  onSelectedTreasuryAccountChange,
  onLoadTreasuries,
  onUseRealms,
}: Props) {

    const previewDescription = `${proposalDescription.trim()}

Check it out here: http://localhost:3000/bid?auctionPk=<will be filled after creation>`;
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-fuchsia-500/10 via-white/[0.03] to-cyan-400/5 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-8">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/70 to-transparent" />
      <div className="absolute -right-24 -top-20 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              DAO proposal
            </div>
            <h3 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Governance proposal
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Pick a realm, load treasury accounts, and prepare the proposal flow in one place.
            </p>
          </div>


        </div>

        <div className="grid gap-4">
          <Field label="Proposal name" hint="Short, descriptive title.">
            <input
              value={proposalName}
              onChange={(e) => onProposalNameChange(e.target.value)}
              placeholder="Enable sealed auction for treasury sale"
              className={inputClass}
            />
          </Field>

<Field label="Proposal description" hint="Add context for token holders and voters.">
  <textarea
    value={proposalDescription}
    onChange={(e) => onProposalDescriptionChange(e.target.value)}
    placeholder="Explain the auction intent, target assets, and any execution notes."
    className={textareaClass}
  />

  <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/50">
    <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
      Final proposal description preview
    </div>

    <div className="whitespace-pre-line font-mono text-xs text-white/70">
      {previewDescription}
    </div>
  </div>
</Field>

          

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Realm address" hint="Used to fetch treasury accounts.">
              <input
                value={realmAddress}
                onChange={(e) => onRealmAddressChange(e.target.value)}
                placeholder="Realm address"
                className={inputClass}
              />
            </Field>

            <Field label="Owner program ID" hint="Use Realms for the default program ID.">
              <div className="flex gap-3">
                <input
                  value={governanceProgramId}
                  onChange={(e) => onGovernanceProgramIdChange(e.target.value)}
                  placeholder="Owner Program ID"
                  className={`${inputClass} flex-1`}
                />
                <button type="button" onClick={onUseRealms} className={buttonClass}>
                  Use Realms
                </button>
              </div>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={onLoadTreasuries}
              disabled={loadingTreasuries || !realmAddress}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingTreasuries ? "Loading treasury accounts..." : "Load treasury accounts"}
            </button>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
              <span className="block text-[11px] uppercase tracking-[0.18em] text-white/35">
                Realm community mint
              </span>
              <span className="mt-1 block truncate font-mono text-xs text-white/85">
                {realmCommunityMint || "<not loaded>"}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Treasury wallet" hint="Choose a treasury group.">
              <select
                value={selectedTreasuryGroup}
                onChange={(e) => onSelectedTreasuryGroupChange(e.target.value)}
                className={`${inputClass} appearance-none pr-10`}
              >
                <option value="">Select treasury wallet</option>
                {treasuryGroups.map((group) => (
                  <option key={group.nativeTreasury} value={group.nativeTreasury}>
                    {group.nativeTreasury} — {group.tokenAccounts.length} ATA(s)
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Treasury token account" hint="Use the account that holds the asset.">
              <select
                value={selectedTreasuryAccount}
                onChange={(e) => onSelectedTreasuryAccountChange(e.target.value)}
                className={`${inputClass} appearance-none pr-10`}
              >
                <option value="">Select treasury token account</option>
                {(treasuryGroups.find((g) => g.nativeTreasury === selectedTreasuryGroup)?.tokenAccounts ?? []).map(
                  (row) => (
                    <option key={row.pubkey} value={row.pubkey}>
                      {row.pubkey} — mint {row.mint} — balance {row.uiAmountString}
                    </option>
                  )
                )}
              </select>
            </Field>
          </div>
        </div>
      </div>
    </section>
  );
}