#!/bin/bash

set -e  # stop on error

WALLET1="8F52LN6mttmASoL5YTsb4XNrWhJWVTWRG9twfG8o4u4s"
WALLET2="BtA3YM3ztNTDWJxfFPvs9fgJhyYcQ8hBPRoLahjc1vry"
WALLET3="2JWdUwWv41fMbgCLpzJ1BTFgayauBFYx4e4fMbYZos2M"
RPC_URL="http://127.0.0.1:8899"

echo "🔧 Setting Solana config to localnet..."
solana config set --url $RPC_URL

echo "🚀 Running init script..."
ts-node initcompdef.ts

airdrop_with_retry () {
  local WALLET=$1

  echo "💸 Airdropping 10,000 SOL to $WALLET..."
  solana airdrop 10000 $WALLET || {
    echo "⚠️ Airdrop failed for $WALLET, retrying in chunks..."
    for i in {1..100}; do
      solana airdrop 100 $WALLET
    done
  }

  echo "🔍 Final balance for $WALLET:"
  solana balance $WALLET
}

# Airdrop to both wallets
airdrop_with_retry $WALLET1
airdrop_with_retry $WALLET2
airdrop_with_retry $WALLET3

echo "✅ Done"