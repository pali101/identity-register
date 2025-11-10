use anchor_lang::prelude::*;

// This is your program's unique ID. Get it after you build/deploy.
declare_id!("6a4hgLX7rnVaz3U8EDrMkCuqwXkZreRB8u17KBAeoJCn");

#[program]
pub mod identity_register {
    use super::*;

    // This is the main instruction. It creates the identity account.
    pub fn register_identity(ctx: Context<RegisterIdentity>, username: String, uri: String) -> Result<()> {
        let identity = &mut ctx.accounts.identity_account;
        // Enforce a maximum username length to avoid allocating less space than needed
        // and to provide a clear, deterministic program error when clients pass too-long usernames.
        if username.len() > 50 {
            return err!(ErrorCode::UsernameTooLong);
        }
        
        identity.authority = ctx.accounts.authority.key();
        identity.username = username;
        identity.uri = uri; // This URI will point to the NFT's off-chain JSON metadata
        identity.bump = ctx.bumps.identity_account;
        
        msg!("Identity account created for {} with username: {}", identity.authority, identity.username);
        Ok(())
    }

    // Custom program errors
    #[error_code]
    pub enum ErrorCode {
        #[msg("Username is too long (max 50 characters)")]
        UsernameTooLong,
    }
}

// This struct defines all the accounts required by our `register_identity` instruction
#[derive(Accounts)]
#[instruction(username: String, uri: String)] // Make instruction args available
pub struct RegisterIdentity<'info> {
    
    // This creates the new PDA account
    #[account(
        init,
        payer = authority,
        // Space = 8 (discriminator) + 32 (authority) + (4 + 50) (username) + (4 + 200) (uri) + 1 (bump)
        space = 8 + 32 + 4 + 50 + 4 + 200 + 1,
        // Seeds make the PDA unique to the user
        seeds = [b"identity", authority.key().as_ref()],
        bump
    )]
    pub identity_account: Account<'info, IdentityAccount>,

    // The user who is creating the identity (and paying for it)
    #[account(mut)]
    pub authority: Signer<'info>,
    
    // The Solana System Program, required to create new accounts
    pub system_program: Program<'info, System>,
}

// This struct defines the data to be stored in the `IdentityAccount`
#[account]
pub struct IdentityAccount {
    pub authority: Pubkey,
    pub username: String, // e.g., "alice"
    pub uri: String,      // e.g., "https://arweave.net/..."
    pub bump: u8,
}