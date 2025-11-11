import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { IdentityRegister } from "../target/types/identity_register";
import { assert } from "chai";

describe("identity_register", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Get a handle on the program
  const program = anchor.workspace.IdentityRegister as Program<IdentityRegister>;
  
  // The wallet of the person running the test
  const authority = provider.wallet as anchor.Wallet;

  // Define test data
  const testUsername = "sol_user_123";
  const testSymbol = "IDENTITY";
  const testUri = "https://arweave.net/my-profile-json";

  // Calculate the PDA for the authority's identity account
  const [identityPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("identity"), 
      authority.publicKey.toBuffer()
    ],
    program.programId
  );

  // Calculate the PDA for the reputation account
  const [reputationPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("reputation"), 
      authority.publicKey.toBuffer()
    ],
    program.programId
  );

  // --- Helper to airdrop to new users ---
  const airdrop = async (user: anchor.web3.PublicKey) => {
    const airdropSig = await provider.connection.requestAirdrop(
      user,
      2 * anchor.web3.LAMPORTS_PER_SOL // 2 SOL
    );
    // Wait for the airdrop to confirm
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      signature: airdropSig,
    });
  };

  it("1. Registers a new identity!", async () => {
    // Generate a new mint keypair for the NFT
    const mintKeypair = anchor.web3.Keypair.generate();

    // --- Act ---
    // Call the `registerIdentity` instruction
    const tx = await program.methods
      .registerIdentity(testUsername, testSymbol, testUri)
      .accounts({
        authority: authority.publicKey,
        mint: mintKeypair.publicKey,
      })
      .signers([mintKeypair])
      .rpc();
    
    console.log("Your transaction signature", tx);

    // --- Assert ---
    // Fetch the newly created account
    const accountData = await program.account.identityAccount.fetch(identityPda);

    // Check if the data was stored correctly
    assert.ok(accountData.authority.equals(authority.publicKey), "Authority mismatch");
    assert.strictEqual(accountData.username, testUsername, "Username mismatch");
    assert.strictEqual(accountData.uri, testUri, "URI mismatch");

    console.log("✅ Identity registered successfully!");
    console.log("  Username:", accountData.username);
    console.log("  NFT Mint:", mintKeypair.publicKey.toBase58());
  });

  it("2. Fails to register a duplicate identity!", async () => {
    // Generate another mint keypair
    const mintKeypair2 = anchor.web3.Keypair.generate();

    // --- Act & Assert ---
    // Try to call the same instruction again for the same user
    try {
      await program.methods
        .registerIdentity("new_username", "NEW_SYM", "new_uri") // Different data
        .accounts({
          authority: authority.publicKey,
          mint: mintKeypair2.publicKey,
        })
        .signers([mintKeypair2])
        .rpc();
      
      // If the above doesn't throw an error, force the test to fail
      assert.fail("Transaction should have failed (account already initialized)!");

    } catch (err) {
      // We expect an error, so this is a pass.
      // Anchor will throw an error because the account PDA is already in use.
      assert.include(err.message, "already in use", "Expected 'already in use' error");
      console.log("✅ Correctly prevented duplicate identity registration");
    }
  });

  it("3. Fails when username is too long!", async () => {
    // --- Arrange ---
    // Create a username that is 51 characters (limit is 50)
    const longUsername = "a".repeat(51);

    // We need a new user for this test, as the default user's PDA is already created.
    const newUser = anchor.web3.Keypair.generate();
    await airdrop(newUser.publicKey);

    // Generate a new mint keypair for this test
    const mintKeypair3 = anchor.web3.Keypair.generate();

    // --- Act & Assert ---
    try {
      await program.methods
        .registerIdentity(longUsername, testSymbol, testUri)
        .accounts({
          authority: newUser.publicKey,
          mint: mintKeypair3.publicKey,
        })
        .signers([newUser, mintKeypair3]) // Both the new user and mint must sign
        .rpc();

      assert.fail("Transaction should have failed (username too long)!");
      
    } catch (err: any) {
      // We expect an error due to a too-long username
      // Structured Anchor error
      if (err?.error?.errorCode?.code) {
        assert.equal(
          err.error.errorCode.code,
          "UsernameTooLong",
          `Expected program error 'UsernameTooLong', got: ${JSON.stringify(err.error)}`
        );
        console.log("✅ Correctly rejected username that is too long");
        return;
      }
      
      // If it's a different error format, check the message
      if (err.message && err.message.includes("UsernameTooLong")) {
        console.log("✅ Correctly rejected username that is too long");
        return;
      }
      
      // If we got here, it's an unexpected error
      throw new Error(`Unexpected error: ${err.message || JSON.stringify(err)}`);
    }
  });

  it("4. Fails when URI is too long!", async () => {
    // --- Arrange ---
    // Create a URI that is 201 characters (limit is 200)
    const longUri = "u".repeat(201);

    // We need another new user
    const newUser2 = anchor.web3.Keypair.generate();
    await airdrop(newUser2.publicKey);

    // Generate a new mint keypair for this test
    const mintKeypair4 = anchor.web3.Keypair.generate();

    // --- Act & Assert ---
    try {
      await program.methods
        .registerIdentity(testUsername, testSymbol, longUri) // Use the long URI
        .accounts({
          authority: newUser2.publicKey,
          mint: mintKeypair4.publicKey,
        })
        .signers([newUser2, mintKeypair4])
        .rpc();

      assert.fail("Transaction should have failed (URI too long)!");
      
    } catch (err: any) {
      // Check for the custom program error
      assert.equal(
        err.error.errorCode.code,
        "UriTooLong",
        `Expected program error 'UriTooLong', got: ${JSON.stringify(err.error)}`
      );
      console.log("✅ Correctly rejected URI that is too long");
    }
  });

  it("5. Initializes a new reputation account!", async () => {
    // --- Act ---
    // Assumes test 1 successfully created the identity for 'authority'
    const tx = await program.methods
      .initializeReputation()
      .accounts({
        authority: authority.publicKey,
        identityAccount: identityPda, // Pass the existing identity PDA
        reputationAccount: reputationPda, // Pass the new PDA to be created
      })
      .rpc();
    
    console.log("Your transaction signature", tx);

    // --- Assert ---
    const accountData = await program.account.reputationAccount.fetch(reputationPda);

    // Check if the data was initialized correctly
    assert.ok(accountData.authority.equals(authority.publicKey), "Authority mismatch");
    // Use .toNumber() because u64 fields are returned as BN (BigNumber)
    assert.strictEqual(accountData.totalTransactions.toNumber(), 0, "Transactions not 0");
    assert.strictEqual(accountData.totalVolume.toNumber(), 0, "Volume not 0");
    assert.strictEqual(accountData.totalReviews.toNumber(), 0, "Reviews not 0");
    assert.strictEqual(accountData.totalRatingScore.toNumber(), 0, "Rating score not 0");

    console.log("✅ Reputation account initialized successfully!");
  });

  it("6. Fails to initialize a duplicate reputation account!", async () => {
    // --- Act & Assert ---
    // Assumes test 5 successfully created the reputation account
    try {
      await program.methods
        .initializeReputation()
        .accounts({
          authority: authority.publicKey,
          identityAccount: identityPda,
          reputationAccount: reputationPda,
        })
        .rpc();
      
      assert.fail("Transaction should have failed (account already in use)!");

    } catch (err) {
      assert.include(err.message, "already in use", "Expected 'already in use' error");
      console.log("✅ Correctly prevented duplicate reputation account");
    }
  });

  it("7. Fails to initialize reputation for a non-existent identity!", async () => {
    // --- Arrange ---
    // We need a new user that *will not* register an identity
    const newUser3 = anchor.web3.Keypair.generate();
    await airdrop(newUser3.publicKey);

    // Calculate PDAs for this new user
    const [newUserIdentityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("identity"), newUser3.publicKey.toBuffer()],
      program.programId
    );
    const [newUserReputationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), newUser3.publicKey.toBuffer()],
      program.programId
    );

    // --- Act & Assert ---
    try {
      await program.methods
        .initializeReputation()
        .accounts({
          authority: newUser3.publicKey,
          identityAccount: newUserIdentityPda, // This PDA *does not exist*
          reputationAccount: newUserReputationPda,
        })
        .signers([newUser3])
        .rpc();

      assert.fail("Should have failed (identity account not initialized)!");
      
    } catch (err: any) {
      // This is the error Anchor throws when a required account (identityAccount)
      // does not exist or has not been initialized.
      assert(
        err.message.includes("AccountNotInitialized"),
        `Expected 'AccountNotInitialized' error, got: ${err.message}`
      );
      
      console.log("✅ Correctly failed (identity account not initialized)");
    }
  });
});