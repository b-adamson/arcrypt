
// Types that use Anchor 1.x IDL features (generics, anonymous fields) that
// @coral-xyz/anchor 0.32.x cannot represent. They are Arcium protocol internals
// not needed for reading our program's accounts or building user-facing txs.
const UNSUPPORTED_TYPES = new Set([
  "epoch",                   // anonymous field: fields: ["u64"]
  "bn254g2blsPublicKey",     // anonymous field: fields: [{array: [...]}]
  "setUnset",                // top-level generics + anonymous variant fields
  "mxeEncryptedStruct",      // top-level generics
  "signedComputationOutputs",// top-level generics + anonymous variant fields
  // Output types that reference mxeEncryptedStruct<N> with generics
  "initAuctionStateOutputStruct0",
  "placeBidOutputStruct0",
  "placeEncryptedBidOutputStruct0",
  "determineWinnerFirstPriceOutputStruct00",
  "determineWinnerVickreyOutputStruct00",
  // activation uses epoch via defined reference
  "activation",
]);

/**
 * Convert an Anchor 1.x IDL to be compatible with @coral-xyz/anchor 0.32.x.
 *
 * Key change: `defined` type references changed from string to object.
 *   1.x: { "defined": { "name": "TypeName", "generics": [...] } }
 *   0.x: { "defined": "TypeName" }
 *
 * We also strip types and instructions that use 1.x-only features.
 */
export function downgradeIdl(idl: any): any {
  const out = JSON.parse(JSON.stringify(idl));

  convertDefined(out);

  if (Array.isArray(out.types)) {
    out.types = out.types.filter((t: any) => !UNSUPPORTED_TYPES.has(t.name));
  }

  if (Array.isArray(out.instructions)) {
    out.instructions = out.instructions.filter(
      (ix: any) => !ix.name.endsWith("Callback")
    );
  }

  return out;
}

function convertDefined(node: any): void {
  if (node === null || typeof node !== "object") return;

  if (Array.isArray(node)) {
    node.forEach(convertDefined);
    return;
  }

  if (
    typeof node.defined === "object" &&
    node.defined !== null &&
    typeof node.defined.name === "string"
  ) {
    node.defined = node.defined.name;
  }

  for (const key of Object.keys(node)) {
    convertDefined(node[key]);
  }
}
