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
    
    // Airdrop some SOL to the new user so they can pay for the account
    const airdropSig = await provider.connection.requestAirdrop(
      newUser.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL // 2 SOL
    );
    // Wait for the airdrop to confirm
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      signature: airdropSig,
    });

    // Calculate the PDA for the *new user*
    const [newUserPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("identity"),
        newUser.publicKey.toBuffer()
      ],
      program.programId
    );

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
});