use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_master_edition_v3, create_metadata_accounts_v3, CreateMasterEditionV3,
        CreateMetadataAccountsV3, Metadata,
    },
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::types::{Creator, DataV2};

// This is your program's unique ID. Get it after you build/deploy.
declare_id!("6a4hgLX7rnVaz3U8EDrMkCuqwXkZreRB8u17KBAeoJCn");

#[program]
pub mod identity_register {
    use super::*;

    // This is the main instruction. It creates the identity account.
    pub fn register_identity(ctx: Context<RegisterIdentity>, username: String, symbol: String, uri: String) -> Result<()> {
        let identity = &mut ctx.accounts.identity_account;
        // Enforce a maximum username length to avoid allocating less space than needed
        // and to provide a clear, deterministic program error when clients pass too-long usernames.
        if username.len() > 50 {
            return err!(ErrorCode::UsernameTooLong);
        }
        
        identity.authority = ctx.accounts.authority.key();
        identity.username = username.clone();
        identity.uri = uri.clone(); // This URI will point to the NFT's off-chain JSON metadata
        identity.bump = ctx.bumps.identity_account;
        
        msg!("Identity account created for {} with username: {}", identity.authority, identity.username);

        msg!("Minting Identity NFT...");

        // CPI 1: Mint 1 token to the user's token account
        mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            1, // Mint 1 token
        )?;

        msg!("Token minted");

        // CPI 2: Create the Metaplex Metadata Account
        let creators = vec![
            Creator {
                address: ctx.accounts.authority.key(),
                verified: true, // The signer is verified as a creator
                share: 100,
            }
        ];

        create_metadata_accounts_v3(
            CpiContext::new(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    mint_authority: ctx.accounts.authority.to_account_info(),
                    payer: ctx.accounts.authority.to_account_info(),
                    update_authority: ctx.accounts.authority.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            DataV2 {
                name: username, // Use the username from the instruction
                symbol: symbol, // Use the symbol from the instruction
                uri: uri,       // Use the URI from the instruction
                seller_fee_basis_points: 0,
                creators: Some(creators),
                collection: None,
                uses: None,
            },
            false, // is_mutable: We make the NFT immutable
            true,  // update_authority_is_signer
            None,  // collection_details
        )?;

        msg!("Metadata account created");

        // CPI 3: Create the Metaplex Master Edition Account (locks supply to 1)
        create_master_edition_v3(
            CpiContext::new(
                ctx.accounts.token_metadata_program.to_account_info(),
                CreateMasterEditionV3 {
                    edition: ctx.accounts.master_edition_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    update_authority: ctx.accounts.authority.to_account_info(),
                    mint_authority: ctx.accounts.authority.to_account_info(),
                    payer: ctx.accounts.authority.to_account_info(),
                    metadata: ctx.accounts.metadata_account.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            Some(0), // Max supply 0 = locked. This is what makes it a 1-of-1 NFT.
        )?;

        msg!("Master Edition created. Identity NFT mint complete!");

        Ok(())
    }
}

// Custom program errors
#[error_code]
pub enum ErrorCode {
    #[msg("Username is too long (max 50 characters)")]
    UsernameTooLong,
}

// This struct defines all the accounts required by our `register_identity` instruction
#[derive(Accounts)]
#[instruction(username: String, symbol: String, uri: String)] // Make instruction args available
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

    #[account(
        init, // We are initializing this mint account
        payer = authority,
        mint::decimals = 0, // NFTs must have 0 decimals
        mint::authority = authority, // The user is the mint authority
        mint::freeze_authority = authority, // The user is the freeze authority
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init, // Create the user's token account
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub token_account: Account<'info, TokenAccount>, // The user's ATA

    /// CHECK: This is not dangerous because we are passing the right seeds
    #[account(
        mut,
        seeds = [
            b"metadata",
            token_metadata_program.key().as_ref(),
            mint.key().as_ref()
        ],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub metadata_account: UncheckedAccount<'info>,

    /// CHECK: This is not dangerous because we are passing the right seeds
    #[account(
        mut,
        seeds = [
            b"metadata",
            token_metadata_program.key().as_ref(),
            mint.key().as_ref(),
            b"edition"
        ],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub master_edition_account: UncheckedAccount<'info>,

    // --- Required Programs ---

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub rent: Sysvar<'info, Rent>,
}

// This struct defines the data to be stored in the `IdentityAccount`
#[account]
pub struct IdentityAccount {
    pub authority: Pubkey,
    pub username: String, // e.g., "alice"
    pub uri: String,      // e.g., "https://arweave.net/..."
    pub bump: u8,
}