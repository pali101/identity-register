# Identity Register - Solana Trust Layer

A Solana program that establishes a two-layered trust system for decentralized agent interactions, combining on-chain identity verification with reputation-based economic incentives.

## Problem

In pay-as-you-go (PAYG) models, we face two distinct trust challenges:

1. **Economic Trust (The Transaction)**: PAYG models provide implicit economic trust through tightly coupled payment-delivery mechanisms. However, this only ensures accountability *during* the service delivery.

2. **Identity Trust (The Handshake)**: The critical challenge occurs *before* any transaction. How does a user trust a new agent? This requires upfront validation of the agent's legitimacy and data authenticity, even when individual transaction risks are small.

### The Two-Fold Solution

- **Layer 1: Identity/Reputation** - An upfront validation layer (credentials, reputation systems) enabling users to confidently connect to new agents
- **Layer 2: Economic** - PAYG model maintaining agent honesty and accountability during ongoing interactions

This implementation provides Layer 1 (inspired by ERC-8004 concepts adapted for Solana), while the x402 protocol provides Layer 2 economic incentives.

## Solution

This Solana program implements an on-chain identity and reputation system with the following features:

### Current Implementation

#### 1. **Identity Registration**
- Creates a unique Program Derived Address (PDA) for each agent
- Mints a NFT as proof of identity using Metaplex Token Metadata
- Stores username and metadata URI on-chain
- Immutable identity NFTs (Master Edition with 0 supply)

#### 2. **Reputation Tracking**
- Separate reputation PDA for each registered identity
- Tracks key metrics:
  - Total transactions completed
  - Total payment volume processed
  - Total reviews received
  - Aggregate rating scores
- Real-time updates on service completion

#### 3. **Service Transaction Logging**
- Token transfers between users and agents
- Automatic reputation updates on payment
- On-chain proof of service delivery
- Overflow protection for all numeric fields

## Architecture

```
┌─────────────────────┐
│  Identity Account   │
│  (PDA)             │
│  - Authority       │
│  - Username        │
│  - URI             │
│  - NFT Proof       │
└──────────┬──────────┘
           │
           │ validates
           ▼
┌─────────────────────┐
│ Reputation Account  │
│  (PDA)             │
│  - Total Txns      │
│  - Total Volume    │
│  - Reviews         │
│  - Rating Score    │
└──────────┬──────────┘
           │
           │ updated by
           ▼
┌─────────────────────┐
│ Service Transaction │
│  - Token Transfer  │
│  - Reputation++    │
└─────────────────────┘
```

## Instructions

### `register_identity`
Creates a new identity account with an associated soulbound NFT.

**Parameters:**
- `username`: String (max 50 chars)
- `symbol`: Token symbol for the identity NFT
- `uri`: Metadata URI (max 200 chars) pointing to off-chain JSON

**Actions:**
1. Initializes identity PDA
2. Creates NFT mint with 0 decimals
3. Mints 1 token to user's associated token account
4. Creates Metaplex metadata account
5. Creates Master Edition (locks supply at 1)

### `initialize_reputation`
Initializes a reputation tracking account for a registered identity.

**Parameters:** None (derives from signer's identity)

**Actions:**
1. Validates identity account exists
2. Creates reputation PDA
3. Initializes all metrics to 0

### `log_service_transaction`
Records a service transaction with token payment and updates reputation.

**Parameters:**
- `amount`: u64 - Payment amount in token base units

**Actions:**
1. Transfers tokens from payer to agent
2. Increments agent's transaction count
3. Adds to agent's total volume
4. Emits on-chain logs

## Program Structure

```
identity_register/
├── programs/
│   └── identity_register/
│       └── src/
│           └── lib.rs          # Main program logic
├── tests/
│   └── identity_register.ts    # Integration tests
├── target/
│   ├── idl/
│   │   └── identity_register.json
│   └── types/
│       └── identity_register.ts
├── Anchor.toml
└── package.json
```

## Technical Details

- **Program ID**: `8EavuS1VJ6GXEwqdgm65mofBQSULf1nXY2pmvhbNyS7k`
- **Framework**: Anchor 0.32.1
- **Network**: Devnet
- **Dependencies**:
  - `anchor-spl`: Token and Metaplex integration
  - `mpl-token-metadata`: NFT metadata standards

## Getting Started

### Build

```bash
anchor build
```

### Test

```bash
anchor test
```

### Deploy

```bash
anchor deploy
```

## Usage Example

```typescript
// Register an identity
await program.methods
  .registerIdentity("alice_agent", "IDENTITY", "https://arweave.net/profile")
  .accounts({
    identityAccount: identityPda,
    authority: wallet.publicKey,
    mint: mintKeypair.publicKey,
    // ... other accounts
  })
  .signers([mintKeypair])
  .rpc();

// Initialize reputation
await program.methods
  .initializeReputation()
  .accounts({
    authority: wallet.publicKey,
    identityAccount: identityPda,
    reputationAccount: reputationPda,
  })
  .rpc();

// Log a service transaction
await program.methods
  .logServiceTransaction(new BN(50_000_000)) // 50 USDC
  .accounts({
    payer: payerKeypair.publicKey,
    authority: agentAuthority,
    reputationAccount: reputationPda,
    // ... token accounts
  })
  .signers([payerKeypair])
  .rpc();
```

## Future Work

### Validation Layer
To complete the trust system, future development will include:

- **Identity Verification**: Integration with decentralized identity providers (DIDs)
- **Review System**: Implementation of the `ReviewAccount` structure for user feedback
- **Reputation Algorithms**: Weighted scoring based on transaction volume, recency, and reviews
- **Slashing Mechanisms**: Penalties for malicious behavior or poor service
- **Cross-Chain Verification**: Bridge to EVM chains supporting ERC-8004
- **Dispute Resolution**: On-chain arbitration for service conflicts

## Security Considerations

- All PDAs use proper seed derivation for deterministic addresses
- Token transfers use CPI (Cross-Program Invocation) for atomicity
- Overflow protection on all arithmetic operations
- Input validation on username and URI lengths
- Identity NFTs are immutable and non-transferable

## License

ISC

## Contributing

This project was developed as part of a Solana X402 hackathon. Contributions are welcome!
