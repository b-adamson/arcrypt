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
      <label className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-[var(--muted)]/80">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  "h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/40";

const textareaClass =
  "min-h-[110px] w-full border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/40";

const buttonClass =
  "btn h-12 px-4 text-sm font-medium";

export default function GovernanceProposalPanel({
  proposalName,
  proposalDescription,
  realmAddress,
  governanceProgramId,
  realmCommunityMint,
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
    <section className="relative overflow-hidden border border-[var(--line)] bg-[var(--surface)] p-6 shadow-none md:p-8">
      <div className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]" />

      <div className="relative">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex border border-[var(--line)] bg-[var(--background)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              DAO proposal
            </div>
            <h3 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
              Governance proposal
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
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

            <div className="mt-3 border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--muted)]">
              <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]/70">
                Final proposal description preview
              </div>

              <div className="whitespace-pre-line font-mono text-xs text-[var(--foreground)]">
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
              className={`${buttonClass} justify-center disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {loadingTreasuries ? "Loading treasury accounts..." : "Load treasury accounts"}
            </button>

            <div className="border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--muted)]">
              <span className="block text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]/70">
                Realm community mint
              </span>
              <span className="mt-1 block truncate font-mono text-xs text-[var(--foreground)]">
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