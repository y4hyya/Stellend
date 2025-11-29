#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol,
};

// ============================================================================
// CONSTANTS
// ============================================================================

/// Scaling factor for percentages and rates (1e7 = 10_000_000)
/// 100% = 10_000_000, 75% = 7_500_000, 1% = 100_000
const SCALE: i128 = 10_000_000;

/// Initial exchange rate for sTokens (1:1 with underlying)
/// Scaled by 1e9 for precision
const INITIAL_EXCHANGE_RATE: i128 = 1_000_000_000;

/// Liquidation parameters
/// Close factor: Maximum portion of debt that can be liquidated (50%)
const CLOSE_FACTOR: i128 = 5_000_000; // 50% (scaled by SCALE)
/// Liquidation bonus: Extra collateral given to liquidator (5%)
const LIQUIDATION_BONUS: i128 = 500_000; // 5% (scaled by SCALE)

/// Asset symbols
const XLM: Symbol = symbol_short!("XLM");
const USDC: Symbol = symbol_short!("USDC");

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/// Storage keys for the lending pool
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    // ========== CONFIGURATION ==========
    /// Admin address
    Admin,
    /// Token contract address for an asset
    TokenAddress(Symbol),
    /// Price oracle contract address
    PriceOracle,
    /// Interest rate model contract address
    InterestRateModel,
    /// LTV ratio per asset (scaled by SCALE, 75% = 7_500_000)
    LtvRatio(Symbol),
    /// Liquidation threshold per asset (scaled by SCALE, 80% = 8_000_000)
    LiquidationThreshold(Symbol),
    /// Whether an asset is enabled as collateral
    CollateralEnabled(Symbol),
    /// Whether an asset is enabled for borrowing
    BorrowEnabled(Symbol),

    // ========== POOL STATE (per asset) ==========
    /// Total underlying supplied to the pool
    TotalSupply(Symbol),
    /// Total sToken shares minted
    TotalShares(Symbol),
    /// Total borrowed from the pool
    TotalBorrow(Symbol),
    /// Exchange rate: underlying per sToken (scaled by 1e9)
    ExchangeRate(Symbol),
    /// Borrow index for interest accrual (scaled by 1e9)
    BorrowIndex(Symbol),
    /// Last interest accrual timestamp
    LastAccrualTime(Symbol),
    /// Reserve factor (portion of interest going to reserves)
    ReserveFactor(Symbol),
    /// Total reserves accumulated
    TotalReserves(Symbol),

    // ========== USER STATE ==========
    /// User's sToken share balance per asset
    UserShares(Address, Symbol),
    /// User's collateral balance per asset (in underlying units)
    UserCollateral(Address, Symbol),
    /// User's debt balance per asset (principal, before interest)
    UserDebt(Address, Symbol),
    /// User's borrow index at time of last borrow (for interest calculation)
    UserBorrowIndex(Address, Symbol),
}

/// Result struct for user position queries
#[derive(Clone)]
#[contracttype]
pub struct UserPosition {
    pub collateral_value_usd: i128,
    pub debt_value_usd: i128,
    pub available_borrow_usd: i128,
    pub health_factor: i128,
}

/// Result struct for market info queries
#[derive(Clone)]
#[contracttype]
pub struct MarketInfo {
    pub total_supply: i128,
    pub total_borrow: i128,
    pub total_shares: i128,
    pub exchange_rate: i128,
    pub utilization_rate: i128,
    pub borrow_rate: i128,      // Annual borrow APR (scaled by 1e7)
    pub supply_rate: i128,      // Annual supply APY (scaled by 1e7)
    pub ltv_ratio: i128,
}

// ============================================================================
// CONTRACT
// ============================================================================

/// Stellend Lending Pool Contract
/// 
/// A peer-to-pool lending market supporting multiple assets.
/// Users can:
/// - Supply assets to earn interest (receive sTokens)
/// - Deposit collateral (XLM) to enable borrowing
/// - Borrow assets against collateral (respecting LTV)
/// - Repay borrowed assets
///
/// ## Interest Accrual
/// 
/// Interest is accrued on each interaction (supply, withdraw, borrow, repay).
/// The borrow rate is determined by the external Interest Rate Model contract,
/// which uses a kinked rate model based on pool utilization.
#[contract]
pub struct LendingPool;

// ============================================================================
// EXTERNAL CONTRACT INTERFACES
// ============================================================================

// Oracle contract client for cross-contract calls
mod oracle_contract {
    soroban_sdk::contractimport!(
        file = "../target/wasm32-unknown-unknown/release/stellend_price_oracle.wasm"
    );
}

// Flag to enable/disable oracle calls (for testing without deployed oracle)
const USE_ORACLE: bool = false; // Set to true when oracle is deployed

#[contractimpl]
impl LendingPool {
    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /// Initialize the lending pool
    /// 
    /// # Arguments
    /// * `admin` - Admin address for protocol management
    /// * `price_oracle` - Price oracle contract address
    /// * `interest_rate_model` - Interest rate model contract address
    /// * `xlm_token` - Wrapped XLM token contract address
    /// * `usdc_token` - USDC token contract address
    pub fn initialize(
        env: Env,
        admin: Address,
        price_oracle: Address,
        interest_rate_model: Address,
        xlm_token: Address,
        usdc_token: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }

        // Store admin and external contract addresses
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PriceOracle, &price_oracle);
        env.storage().instance().set(&DataKey::InterestRateModel, &interest_rate_model);

        // Store token addresses
        env.storage().instance().set(&DataKey::TokenAddress(XLM), &xlm_token);
        env.storage().instance().set(&DataKey::TokenAddress(USDC), &usdc_token);

        // Initialize XLM market (collateral only, not borrowable)
        Self::init_market(&env, XLM, 7_500_000, 8_000_000, true, false); // 75% LTV, 80% liq threshold

        // Initialize USDC market (borrowable, can be collateral)
        Self::init_market(&env, USDC, 8_000_000, 8_500_000, true, true); // 80% LTV, 85% liq threshold
    }

    /// Internal: Initialize a market for an asset
    fn init_market(env: &Env, asset: Symbol, ltv: i128, liq_threshold: i128, collateral: bool, borrow: bool) {
        env.storage().instance().set(&DataKey::LtvRatio(asset.clone()), &ltv);
        env.storage().instance().set(&DataKey::LiquidationThreshold(asset.clone()), &liq_threshold);
        env.storage().instance().set(&DataKey::CollateralEnabled(asset.clone()), &collateral);
        env.storage().instance().set(&DataKey::BorrowEnabled(asset.clone()), &borrow);
        env.storage().instance().set(&DataKey::TotalSupply(asset.clone()), &0i128);
        env.storage().instance().set(&DataKey::TotalShares(asset.clone()), &0i128);
        env.storage().instance().set(&DataKey::TotalBorrow(asset.clone()), &0i128);
        env.storage().instance().set(&DataKey::ExchangeRate(asset.clone()), &INITIAL_EXCHANGE_RATE);
        env.storage().instance().set(&DataKey::BorrowIndex(asset.clone()), &INITIAL_EXCHANGE_RATE);
        env.storage().instance().set(&DataKey::LastAccrualTime(asset.clone()), &env.ledger().timestamp());
        env.storage().instance().set(&DataKey::ReserveFactor(asset.clone()), &1_000_000i128); // 10%
        env.storage().instance().set(&DataKey::TotalReserves(asset.clone()), &0i128);
    }

    // ========================================================================
    // SUPPLY FUNCTIONS (Deposit underlying, receive sTokens)
    // ========================================================================

    /// Supply assets to the lending pool
    /// 
    /// Deposits underlying tokens and mints sToken shares representing
    /// the user's claim on the pool (including future interest).
    /// 
    /// # Arguments
    /// * `user` - The depositor's address
    /// * `asset` - Asset symbol (XLM or USDC)
    /// * `amount` - Amount of underlying to deposit
    /// 
    /// # Returns
    /// Amount of sToken shares minted
    pub fn supply(env: Env, user: Address, asset: Symbol, amount: i128) -> i128 {
        user.require_auth();
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Accrue interest before state changes
        Self::accrue_interest(&env, asset.clone());

        // Get current exchange rate
        let exchange_rate = Self::get_exchange_rate_internal(&env, asset.clone());
        
        // Calculate shares to mint: shares = amount * 1e9 / exchange_rate
        let shares_to_mint = (amount * INITIAL_EXCHANGE_RATE) / exchange_rate;
        
        if shares_to_mint <= 0 {
            panic!("Amount too small");
        }

        // Transfer underlying from user to pool
        let token_address: Address = env.storage().instance().get(&DataKey::TokenAddress(asset.clone())).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&user, &env.current_contract_address(), &amount);

        // Update user's share balance
        let current_shares: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserShares(user.clone(), asset.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::UserShares(user.clone(), asset.clone()), &(current_shares + shares_to_mint));

        // Update total supply and shares
        let total_supply: i128 = env.storage().instance().get(&DataKey::TotalSupply(asset.clone())).unwrap_or(0);
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares(asset.clone())).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply(asset.clone()), &(total_supply + amount));
        env.storage().instance().set(&DataKey::TotalShares(asset.clone()), &(total_shares + shares_to_mint));

        // Emit event
        env.events().publish((symbol_short!("supply"), user, asset), (amount, shares_to_mint));

        shares_to_mint
    }

    /// Withdraw assets from the lending pool
    /// 
    /// Burns sToken shares and returns underlying tokens to the user.
    /// 
    /// # Arguments
    /// * `user` - The user's address
    /// * `asset` - Asset symbol
    /// * `share_amount` - Amount of sToken shares to burn
    /// 
    /// # Returns
    /// Amount of underlying tokens returned
    pub fn withdraw(env: Env, user: Address, asset: Symbol, share_amount: i128) -> i128 {
        user.require_auth();
        
        if share_amount <= 0 {
            panic!("Amount must be positive");
        }

        // Accrue interest before state changes
        Self::accrue_interest(&env, asset.clone());

        // Check user has sufficient shares
        let user_shares: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserShares(user.clone(), asset.clone()))
            .unwrap_or(0);
        if user_shares < share_amount {
            panic!("Insufficient share balance");
        }

        // Calculate underlying to return: underlying = shares * exchange_rate / 1e9
        let exchange_rate = Self::get_exchange_rate_internal(&env, asset.clone());
        let underlying_amount = (share_amount * exchange_rate) / INITIAL_EXCHANGE_RATE;

        // Check pool has sufficient liquidity
        let total_supply: i128 = env.storage().instance().get(&DataKey::TotalSupply(asset.clone())).unwrap_or(0);
        let total_borrow: i128 = env.storage().instance().get(&DataKey::TotalBorrow(asset.clone())).unwrap_or(0);
        let available_liquidity = total_supply - total_borrow;
        if available_liquidity < underlying_amount {
            panic!("Insufficient pool liquidity");
        }

        // Update user's share balance
        env.storage()
            .persistent()
            .set(&DataKey::UserShares(user.clone(), asset.clone()), &(user_shares - share_amount));

        // Update total supply and shares
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares(asset.clone())).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply(asset.clone()), &(total_supply - underlying_amount));
        env.storage().instance().set(&DataKey::TotalShares(asset.clone()), &(total_shares - share_amount));

        // Transfer underlying from pool to user
        let token_address: Address = env.storage().instance().get(&DataKey::TokenAddress(asset.clone())).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &user, &underlying_amount);

        // Emit event
        env.events().publish((symbol_short!("withdraw"), user, asset), (underlying_amount, share_amount));

        underlying_amount
    }

    // ========================================================================
    // COLLATERAL FUNCTIONS
    // ========================================================================

    /// Deposit collateral for borrowing
    /// 
    /// Collateral is separate from supplied assets and is used to
    /// secure borrowing positions.
    /// 
    /// # Arguments
    /// * `user` - The user's address
    /// * `asset` - Asset symbol (typically XLM)
    /// * `amount` - Amount to deposit as collateral
    pub fn deposit_collateral(env: Env, user: Address, asset: Symbol, amount: i128) -> i128 {
        user.require_auth();
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Check asset is enabled as collateral
        let collateral_enabled: bool = env
            .storage()
            .instance()
            .get(&DataKey::CollateralEnabled(asset.clone()))
            .unwrap_or(false);
        if !collateral_enabled {
            panic!("Asset not enabled as collateral");
        }

        // Transfer from user to pool
        let token_address: Address = env.storage().instance().get(&DataKey::TokenAddress(asset.clone())).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&user, &env.current_contract_address(), &amount);

        // Update user collateral balance
        let current_collateral: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserCollateral(user.clone(), asset.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::UserCollateral(user.clone(), asset.clone()), &(current_collateral + amount));

        // Emit event
        env.events().publish((symbol_short!("coll_dep"), user, asset), amount);

        amount
    }

    /// Withdraw collateral
    /// 
    /// # Arguments
    /// * `user` - The user's address
    /// * `asset` - Asset symbol
    /// * `amount` - Amount to withdraw
    pub fn withdraw_collateral(env: Env, user: Address, asset: Symbol, amount: i128) -> i128 {
        user.require_auth();
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let current_collateral: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserCollateral(user.clone(), asset.clone()))
            .unwrap_or(0);
        if current_collateral < amount {
            panic!("Insufficient collateral");
        }

        // Check that withdrawal doesn't make position unhealthy
        let new_collateral = current_collateral - amount;
        
        // Temporarily update collateral to check health
        env.storage()
            .persistent()
            .set(&DataKey::UserCollateral(user.clone(), asset.clone()), &new_collateral);
        
        let position = Self::get_user_position(env.clone(), user.clone());
        
        // If user has debt, ensure health factor stays above 1.0
        if position.debt_value_usd > 0 && position.health_factor < SCALE {
            // Revert the temporary update
            env.storage()
                .persistent()
                .set(&DataKey::UserCollateral(user.clone(), asset.clone()), &current_collateral);
            panic!("Withdrawal would make position unhealthy");
        }

        // Transfer from pool to user
        let token_address: Address = env.storage().instance().get(&DataKey::TokenAddress(asset.clone())).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &user, &amount);

        // Emit event
        env.events().publish((symbol_short!("coll_wth"), user, asset), amount);

        amount
    }

    // ========================================================================
    // BORROW FUNCTIONS
    // ========================================================================

    /// Borrow assets from the lending pool
    /// 
    /// Borrows underlying tokens against deposited collateral.
    /// Requires: (total_debt_usd + new_borrow_usd) <= collateral_usd * LTV
    /// 
    /// # Arguments
    /// * `user` - The borrower's address
    /// * `asset` - Asset symbol to borrow (typically USDC)
    /// * `amount` - Amount to borrow
    pub fn borrow(env: Env, user: Address, asset: Symbol, amount: i128) -> i128 {
        user.require_auth();
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Check asset is enabled for borrowing
        let borrow_enabled: bool = env
            .storage()
            .instance()
            .get(&DataKey::BorrowEnabled(asset.clone()))
            .unwrap_or(false);
        if !borrow_enabled {
            panic!("Asset not enabled for borrowing");
        }

        // Accrue interest before state changes
        Self::accrue_interest(&env, asset.clone());

        // Check pool has sufficient liquidity
        let total_supply: i128 = env.storage().instance().get(&DataKey::TotalSupply(asset.clone())).unwrap_or(0);
        let total_borrow: i128 = env.storage().instance().get(&DataKey::TotalBorrow(asset.clone())).unwrap_or(0);
        let available_liquidity = total_supply - total_borrow;
        if available_liquidity < amount {
            panic!("Insufficient pool liquidity");
        }

        // Get current user position
        let position = Self::get_user_position(env.clone(), user.clone());

        // Get borrow amount in USD
        let oracle: Address = env.storage().instance().get(&DataKey::PriceOracle).unwrap();
        let asset_price = Self::get_asset_price(&env, &oracle, &asset);
        let borrow_value_usd = (amount * asset_price) / SCALE;

        // Check LTV constraint: new_total_debt <= collateral * LTV
        let new_total_debt_usd = position.debt_value_usd + borrow_value_usd;
        if new_total_debt_usd > position.available_borrow_usd + position.debt_value_usd {
            panic!("Borrow exceeds LTV limit");
        }

        // Update user's debt balance
        let current_debt: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserDebt(user.clone(), asset.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::UserDebt(user.clone(), asset.clone()), &(current_debt + amount));

        // Store user's borrow index for interest calculation
        let borrow_index: i128 = env.storage().instance().get(&DataKey::BorrowIndex(asset.clone())).unwrap();
        env.storage()
            .persistent()
            .set(&DataKey::UserBorrowIndex(user.clone(), asset.clone()), &borrow_index);

        // Update total borrow
        env.storage().instance().set(&DataKey::TotalBorrow(asset.clone()), &(total_borrow + amount));

        // Transfer underlying from pool to user
        let token_address: Address = env.storage().instance().get(&DataKey::TokenAddress(asset.clone())).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &user, &amount);

        // Emit event
        env.events().publish((symbol_short!("borrow"), user, asset), amount);

        amount
    }

    /// Repay borrowed assets
    /// 
    /// Reduces user's debt balance and pool's total borrows.
    /// 
    /// # Arguments
    /// * `user` - The borrower's address
    /// * `asset` - Asset symbol
    /// * `amount` - Amount to repay (use i128::MAX to repay all)
    /// 
    /// # Returns
    /// Actual amount repaid
    pub fn repay(env: Env, user: Address, asset: Symbol, amount: i128) -> i128 {
        user.require_auth();
        
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Accrue interest before state changes
        Self::accrue_interest(&env, asset.clone());

        // Get user's current debt (including accrued interest)
        let user_debt = Self::get_user_debt_with_interest(&env, user.clone(), asset.clone());
        
        if user_debt == 0 {
            panic!("No outstanding debt");
        }

        // Cap repayment at outstanding debt
        let repay_amount = if amount > user_debt { user_debt } else { amount };

        // Transfer underlying from user to pool
        let token_address: Address = env.storage().instance().get(&DataKey::TokenAddress(asset.clone())).unwrap();
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&user, &env.current_contract_address(), &repay_amount);

        // Update user's debt balance
        let current_debt: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserDebt(user.clone(), asset.clone()))
            .unwrap_or(0);
        let new_debt = if repay_amount >= user_debt { 0 } else { current_debt - repay_amount };
        env.storage()
            .persistent()
            .set(&DataKey::UserDebt(user.clone(), asset.clone()), &new_debt);

        // Update total borrow
        let total_borrow: i128 = env.storage().instance().get(&DataKey::TotalBorrow(asset.clone())).unwrap_or(0);
        let new_total_borrow = if total_borrow > repay_amount { total_borrow - repay_amount } else { 0 };
        env.storage().instance().set(&DataKey::TotalBorrow(asset.clone()), &new_total_borrow);

        // Emit event
        env.events().publish((symbol_short!("repay"), user, asset), repay_amount);

        repay_amount
    }

    // ========================================================================
    // INTEREST ACCRUAL
    // ========================================================================

    /// Accrue interest for an asset market
    /// 
    /// This function is called before any state-changing operation to ensure
    /// interest is properly accrued. It:
    /// 
    /// 1. Calculates time elapsed since last accrual
    /// 2. Gets the borrow rate from the Interest Rate Model based on utilization
    /// 3. Updates the borrow index (used to track user debt with interest)
    /// 4. Distributes interest between suppliers and reserves
    /// 
    /// ## Interest Model Integration
    /// 
    /// The borrow rate is determined by the external Interest Rate Model contract:
    /// - Uses a kinked rate model based on pool utilization
    /// - Base rate: 0%, Slope1: 4%, Slope2: 75%, Optimal: 80%
    /// - For MVP, we use an internal fallback that mimics the external model
    fn accrue_interest(env: &Env, asset: Symbol) {
        // Get timestamps
        let last_accrual: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LastAccrualTime(asset.clone()))
            .unwrap_or(0);
        let current_time = env.ledger().timestamp();
        
        // Skip if no time has passed
        if current_time <= last_accrual {
            return;
        }

        let time_elapsed = current_time - last_accrual;
        
        // Get current pool state
        let total_supply: i128 = env.storage().instance().get(&DataKey::TotalSupply(asset.clone())).unwrap_or(0);
        let total_borrow: i128 = env.storage().instance().get(&DataKey::TotalBorrow(asset.clone())).unwrap_or(0);
        
        // Skip if nothing to accrue on
        if total_borrow == 0 || total_supply == 0 {
            env.storage().instance().set(&DataKey::LastAccrualTime(asset.clone()), &current_time);
            return;
        }

        // ====================================================================
        // STEP 1: Calculate utilization rate
        // ====================================================================
        // Utilization = Total Borrowed / Total Supplied
        // Scaled by SCALE (1e7), so 80% = 8_000_000
        let utilization = (total_borrow * SCALE) / total_supply;

        // ====================================================================
        // STEP 2: Get borrow rate from Interest Rate Model
        // ====================================================================
        // For MVP, we use an internal implementation that matches the kinked model:
        // - Base rate: 0%
        // - Below 80% utilization: rate = (utilization / 80%) * 4%
        // - Above 80%: rate = 4% + ((utilization - 80%) / 20%) * 75%
        let annual_borrow_rate = Self::calculate_borrow_rate(utilization);
        
        // Convert annual rate to rate for elapsed time
        // interest_factor = annual_rate * time_elapsed / seconds_per_year
        let seconds_per_year: i128 = 31_557_600; // 365.25 days
        let interest_factor = (annual_borrow_rate * time_elapsed as i128) / seconds_per_year;

        // ====================================================================
        // STEP 3: Update borrow index
        // ====================================================================
        // The borrow index tracks accumulated interest over time
        // User debt = principal * current_index / user_index_at_borrow
        let current_borrow_index: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BorrowIndex(asset.clone()))
            .unwrap_or(INITIAL_EXCHANGE_RATE);
        
        // new_index = current_index * (1 + interest_factor)
        let new_borrow_index = current_borrow_index + (current_borrow_index * interest_factor) / SCALE;
        env.storage().instance().set(&DataKey::BorrowIndex(asset.clone()), &new_borrow_index);

        // ====================================================================
        // STEP 4: Calculate and distribute interest
        // ====================================================================
        // Total interest accrued on all borrows
        let interest_accrued = (total_borrow * interest_factor) / SCALE;

        // Split between suppliers and protocol reserves
        let reserve_factor: i128 = env
            .storage()
            .instance()
            .get(&DataKey::ReserveFactor(asset.clone()))
            .unwrap_or(1_000_000); // Default 10%
        
        let reserve_interest = (interest_accrued * reserve_factor) / SCALE;
        let supplier_interest = interest_accrued - reserve_interest;

        // Increase total supply by supplier's portion (this grows sToken value)
        env.storage().instance().set(&DataKey::TotalSupply(asset.clone()), &(total_supply + supplier_interest));
        
        // Increase protocol reserves
        let current_reserves: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalReserves(asset.clone()))
            .unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalReserves(asset.clone()), &(current_reserves + reserve_interest));

        // Update last accrual timestamp
        env.storage().instance().set(&DataKey::LastAccrualTime(asset.clone()), &current_time);
    }

    /// Calculate the borrow rate based on utilization
    /// 
    /// This implements the kinked interest rate model:
    /// - Below optimal (80%): rate increases linearly with slope1 (4%)
    /// - Above optimal: rate increases steeply with slope2 (75%)
    /// 
    /// ## Parameters (matching Interest Rate Model contract)
    /// - Base rate: 0%
    /// - Slope1: 4% (400_000 scaled)
    /// - Slope2: 75% (7_500_000 scaled)
    /// - Optimal utilization: 80% (8_000_000 scaled)
    /// 
    /// ## Example Rates
    /// - 0% utilization → 0% APR
    /// - 40% utilization → 2% APR
    /// - 80% utilization → 4% APR
    /// - 90% utilization → 41.5% APR
    /// - 100% utilization → 79% APR
    /// Calculate the borrow rate using Drift Protocol's multi-kink model
    /// 
    /// ## Rate Curve Zones (from https://docs.drift.trade/lend-borrow/borrow-interest-rate)
    /// 
    /// | Utilization | Behavior | Cumulative ΔR |
    /// |-------------|----------|---------------|
    /// | 0% - U* | Linear to R_opt | 0% |
    /// | U* - 85% | +5% of ΔR | 5% |
    /// | 85% - 90% | +10% of ΔR | 15% |
    /// | 90% - 95% | +15% of ΔR | 30% |
    /// | 95% - 99% | +20% of ΔR | 50% |
    /// | 99% - 100% | +50% of ΔR | 100% |
    /// 
    /// Where: ΔR = R_max - R_opt
    fn calculate_borrow_rate(utilization: i128) -> i128 {
        // Model parameters (matching InterestRateModel contract)
        let rate_min: i128 = 0;            // 0% minimum
        let rate_opt: i128 = 400_000;      // 4% at optimal
        let rate_max: i128 = 10_000_000;   // 100% maximum
        let u_optimal: i128 = 8_000_000;   // 80% optimal utilization

        // Utilization thresholds
        let u_85: i128 = 8_500_000;
        let u_90: i128 = 9_000_000;
        let u_95: i128 = 9_500_000;
        let u_99: i128 = 9_900_000;

        // ΔR = max - optimal
        let delta_r = rate_max - rate_opt;

        let raw_rate = if utilization <= u_optimal {
            // Zone 1: Linear ramp from 0 to R_opt
            (rate_opt * utilization) / u_optimal
            
        } else if utilization <= u_85 {
            // Zone 2: U* to 85% - adds 5% of ΔR
            let range = u_85 - u_optimal;
            let progress = utilization - u_optimal;
            let penalty = (delta_r * 50 * progress) / (range * 1000);
            rate_opt + penalty
            
        } else if utilization <= u_90 {
            // Zone 3: 85% to 90% - adds 10% of ΔR
            let base_penalty = (delta_r * 50) / 1000;
            let range = u_90 - u_85;
            let progress = utilization - u_85;
            let extra_penalty = (delta_r * 100 * progress) / (range * 1000);
            rate_opt + base_penalty + extra_penalty
            
        } else if utilization <= u_95 {
            // Zone 4: 90% to 95% - adds 15% of ΔR
            let base_penalty = (delta_r * 150) / 1000;
            let range = u_95 - u_90;
            let progress = utilization - u_90;
            let extra_penalty = (delta_r * 150 * progress) / (range * 1000);
            rate_opt + base_penalty + extra_penalty
            
        } else if utilization <= u_99 {
            // Zone 5: 95% to 99% - adds 20% of ΔR
            let base_penalty = (delta_r * 300) / 1000;
            let range = u_99 - u_95;
            let progress = utilization - u_95;
            let extra_penalty = (delta_r * 200 * progress) / (range * 1000);
            rate_opt + base_penalty + extra_penalty
            
        } else {
            // Zone 6: 99% to 100% - adds 50% of ΔR
            let base_penalty = (delta_r * 500) / 1000;
            let range = SCALE - u_99;
            let progress = if utilization >= SCALE { range } else { utilization - u_99 };
            let extra_penalty = (delta_r * 500 * progress) / (range * 1000);
            rate_opt + base_penalty + extra_penalty
        };

        // Apply minimum rate floor
        if raw_rate < rate_min { rate_min } else { raw_rate }
    }

    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================

    /// Get exchange rate for sTokens
    fn get_exchange_rate_internal(env: &Env, asset: Symbol) -> i128 {
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares(asset.clone())).unwrap_or(0);
        
        if total_shares == 0 {
            return INITIAL_EXCHANGE_RATE;
        }

        let total_supply: i128 = env.storage().instance().get(&DataKey::TotalSupply(asset.clone())).unwrap_or(0);
        let total_borrow: i128 = env.storage().instance().get(&DataKey::TotalBorrow(asset.clone())).unwrap_or(0);
        let total_reserves: i128 = env.storage().instance().get(&DataKey::TotalReserves(asset.clone())).unwrap_or(0);
        
        // Total cash = supply - borrows + borrow interest (approximated by borrow amount)
        let total_underlying = total_supply + total_borrow - total_reserves;
        
        (total_underlying * INITIAL_EXCHANGE_RATE) / total_shares
    }

    /// Get user's debt including accrued interest
    fn get_user_debt_with_interest(env: &Env, user: Address, asset: Symbol) -> i128 {
        let principal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserDebt(user.clone(), asset.clone()))
            .unwrap_or(0);
        
        if principal == 0 {
            return 0;
        }

        let user_borrow_index: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserBorrowIndex(user, asset.clone()))
            .unwrap_or(INITIAL_EXCHANGE_RATE);
        
        let current_borrow_index: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BorrowIndex(asset))
            .unwrap_or(INITIAL_EXCHANGE_RATE);

        // debt = principal * current_index / user_index
        (principal * current_borrow_index) / user_borrow_index
    }

    /// Get asset price from oracle
    ///
    /// Calls the Price Oracle contract to get current USD price for an asset.
    /// Falls back to hardcoded prices if oracle is not available.
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `oracle` - Oracle contract address
    /// * `asset` - Asset symbol (XLM or USDC)
    ///
    /// # Returns
    /// Price in USD (scaled by 1e7)
    fn get_asset_price(env: &Env, oracle: &Address, asset: &Symbol) -> i128 {
        if USE_ORACLE {
            // Cross-contract call to Oracle
            let oracle_client = oracle_contract::Client::new(env, oracle);
            let price = oracle_client.get_price(asset);
            
            // Fallback if price not set
            if price == 0 {
                Self::get_fallback_price(asset)
            } else {
                price
            }
        } else {
            // Use fallback prices (for testing without deployed oracle)
            Self::get_fallback_price(asset)
        }
    }

    /// Get fallback price for testing
    ///
    /// Used when oracle is not deployed or price not available.
    fn get_fallback_price(asset: &Symbol) -> i128 {
        if *asset == XLM {
            3_000_000 // $0.30
        } else if *asset == USDC {
            SCALE // $1.00
        } else {
            panic!("Unknown asset")
        }
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    /// Get user's complete position across all assets
    pub fn get_user_position(env: Env, user: Address) -> UserPosition {
        let oracle: Address = env.storage().instance().get(&DataKey::PriceOracle).unwrap();

        // Calculate total collateral value in USD
        let mut collateral_value_usd: i128 = 0;
        let mut weighted_collateral_usd: i128 = 0; // collateral * LTV

        // XLM collateral
        let xlm_collateral: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserCollateral(user.clone(), XLM))
            .unwrap_or(0);
        if xlm_collateral > 0 {
            let xlm_price = Self::get_asset_price(&env, &oracle, &XLM);
            let xlm_value = (xlm_collateral * xlm_price) / SCALE;
            collateral_value_usd += xlm_value;
            
            let xlm_ltv: i128 = env.storage().instance().get(&DataKey::LtvRatio(XLM)).unwrap_or(7_500_000);
            weighted_collateral_usd += (xlm_value * xlm_ltv) / SCALE;
        }

        // USDC collateral (if any)
        let usdc_collateral: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserCollateral(user.clone(), USDC))
            .unwrap_or(0);
        if usdc_collateral > 0 {
            let usdc_price = Self::get_asset_price(&env, &oracle, &USDC);
            let usdc_value = (usdc_collateral * usdc_price) / SCALE;
            collateral_value_usd += usdc_value;
            
            let usdc_ltv: i128 = env.storage().instance().get(&DataKey::LtvRatio(USDC)).unwrap_or(8_000_000);
            weighted_collateral_usd += (usdc_value * usdc_ltv) / SCALE;
        }

        // Calculate total debt value in USD
        let mut debt_value_usd: i128 = 0;

        // USDC debt
        let usdc_debt = Self::get_user_debt_with_interest(&env, user.clone(), USDC);
        if usdc_debt > 0 {
            let usdc_price = Self::get_asset_price(&env, &oracle, &USDC);
            debt_value_usd += (usdc_debt * usdc_price) / SCALE;
        }

        // Calculate available borrow (max borrow - current debt)
        let available_borrow_usd = if weighted_collateral_usd > debt_value_usd {
            weighted_collateral_usd - debt_value_usd
        } else {
            0
        };

        // Calculate health factor
        // HF = (collateral * liquidation_threshold) / debt
        let health_factor = if debt_value_usd == 0 {
            999 * SCALE // Infinite
        } else {
            // Use average liquidation threshold (simplified)
            let liq_threshold: i128 = env.storage().instance().get(&DataKey::LiquidationThreshold(XLM)).unwrap_or(8_000_000);
            (collateral_value_usd * liq_threshold) / debt_value_usd
        };

        UserPosition {
            collateral_value_usd,
            debt_value_usd,
            available_borrow_usd,
            health_factor,
        }
    }

    /// Get market information for an asset
    /// Get market information for an asset
    /// 
    /// Returns comprehensive market data including supply, borrow, rates, etc.
    pub fn get_market_info(env: Env, asset: Symbol) -> MarketInfo {
        let total_supply: i128 = env.storage().instance().get(&DataKey::TotalSupply(asset.clone())).unwrap_or(0);
        let total_borrow: i128 = env.storage().instance().get(&DataKey::TotalBorrow(asset.clone())).unwrap_or(0);
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares(asset.clone())).unwrap_or(0);
        let exchange_rate = Self::get_exchange_rate_internal(&env, asset.clone());
        let ltv_ratio: i128 = env.storage().instance().get(&DataKey::LtvRatio(asset.clone())).unwrap_or(0);

        // Calculate utilization rate
        let utilization_rate = if total_supply > 0 {
            (total_borrow * SCALE) / total_supply
        } else {
            0
        };

        // Calculate interest rates using the kinked model
        let borrow_rate = Self::calculate_borrow_rate(utilization_rate);
        
        // Supply rate = borrow_rate * utilization * (1 - reserve_factor)
        let reserve_factor: i128 = env
            .storage()
            .instance()
            .get(&DataKey::ReserveFactor(asset))
            .unwrap_or(1_000_000);
        let supply_rate = if utilization_rate > 0 {
            (borrow_rate * utilization_rate * (SCALE - reserve_factor)) / (SCALE * SCALE)
        } else {
            0
        };

        MarketInfo {
            total_supply,
            total_borrow,
            total_shares,
            exchange_rate,
            utilization_rate,
            borrow_rate,
            supply_rate,
            ltv_ratio,
        }
    }

    /// Get total supply for an asset
    pub fn get_total_supply(env: Env, asset: Symbol) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply(asset)).unwrap_or(0)
    }

    /// Get total borrows for an asset
    pub fn get_total_borrow(env: Env, asset: Symbol) -> i128 {
        env.storage().instance().get(&DataKey::TotalBorrow(asset)).unwrap_or(0)
    }

    /// Get user's share balance for an asset
    pub fn get_user_shares(env: Env, user: Address, asset: Symbol) -> i128 {
        env.storage().persistent().get(&DataKey::UserShares(user, asset)).unwrap_or(0)
    }

    /// Get user's collateral balance for an asset
    pub fn get_user_collateral(env: Env, user: Address, asset: Symbol) -> i128 {
        env.storage().persistent().get(&DataKey::UserCollateral(user, asset)).unwrap_or(0)
    }

    /// Get user's debt balance for an asset (without interest)
    pub fn get_user_debt(env: Env, user: Address, asset: Symbol) -> i128 {
        env.storage().persistent().get(&DataKey::UserDebt(user, asset)).unwrap_or(0)
    }

    /// Get user's debt balance with accrued interest
    pub fn get_user_debt_total(env: Env, user: Address, asset: Symbol) -> i128 {
        Self::get_user_debt_with_interest(&env, user, asset)
    }

    /// Get exchange rate for sTokens
    pub fn get_exchange_rate(env: Env, asset: Symbol) -> i128 {
        Self::get_exchange_rate_internal(&env, asset)
    }

    /// Get utilization rate for an asset
    pub fn get_utilization_rate(env: Env, asset: Symbol) -> i128 {
        let total_supply: i128 = env.storage().instance().get(&DataKey::TotalSupply(asset.clone())).unwrap_or(0);
        let total_borrow: i128 = env.storage().instance().get(&DataKey::TotalBorrow(asset)).unwrap_or(0);
        
        if total_supply == 0 {
            return 0;
        }
        
        (total_borrow * SCALE) / total_supply
    }

    /// Get LTV ratio for an asset
    pub fn get_ltv_ratio(env: Env, asset: Symbol) -> i128 {
        env.storage().instance().get(&DataKey::LtvRatio(asset)).unwrap_or(0)
    }

    /// Get liquidation threshold for an asset
    pub fn get_liquidation_threshold(env: Env, asset: Symbol) -> i128 {
        env.storage().instance().get(&DataKey::LiquidationThreshold(asset)).unwrap_or(0)
    }

    /// Get the current borrow APR for an asset
    /// 
    /// Returns the annualized borrow rate based on current utilization.
    /// Scaled by 1e7, so 5% = 500_000.
    pub fn get_borrow_rate(env: Env, asset: Symbol) -> i128 {
        let utilization = Self::get_utilization_rate(env, asset);
        Self::calculate_borrow_rate(utilization)
    }

    /// Get the current supply APY for an asset
    /// 
    /// Returns the annualized supply rate based on current utilization.
    /// Scaled by 1e7, so 3.2% = 320_000.
    pub fn get_supply_rate(env: Env, asset: Symbol) -> i128 {
        let utilization = Self::get_utilization_rate(env.clone(), asset.clone());
        let borrow_rate = Self::calculate_borrow_rate(utilization);
        
        let reserve_factor: i128 = env
            .storage()
            .instance()
            .get(&DataKey::ReserveFactor(asset))
            .unwrap_or(1_000_000);
        
        // Supply rate = borrow_rate * utilization * (1 - reserve_factor)
        if utilization > 0 {
            (borrow_rate * utilization * (SCALE - reserve_factor)) / (SCALE * SCALE)
        } else {
            0
        }
    }

    /// Get the borrow index for an asset
    /// 
    /// The borrow index tracks accumulated interest. Used to calculate
    /// individual user debt with interest.
    pub fn get_borrow_index(env: Env, asset: Symbol) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::BorrowIndex(asset))
            .unwrap_or(INITIAL_EXCHANGE_RATE)
    }

    /// Get the interest rate model contract address
    pub fn get_interest_rate_model(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::InterestRateModel)
            .unwrap()
    }

    /// Get health factor for a specific user
    /// 
    /// Health Factor = (collateral_value * liquidation_threshold) / debt_value
    /// 
    /// # Returns
    /// - HF >= 1.0 (SCALE): Safe position
    /// - HF < 1.0 (SCALE): Unsafe position, eligible for liquidation
    /// - 999 * SCALE: No debt (infinite health factor)
    /// 
    /// Scaled by SCALE (1e7), so HF = 1.0 is represented as 10_000_000
    pub fn get_health_factor(env: Env, user: Address) -> i128 {
        let position = Self::get_user_position(env, user);
        position.health_factor
    }

    // ========================================================================
    // LIQUIDATION
    // ========================================================================

    /// Liquidate an undercollateralized position
    /// 
    /// Allows a liquidator to repay a portion of a borrower's debt in exchange
    /// for a portion of their collateral plus a liquidation bonus.
    /// 
    /// # Requirements
    /// - Borrower's health factor must be < 1.0
    /// - Liquidator can repay up to 50% of borrower's debt (close factor)
    /// - Liquidator receives equivalent collateral value + 5% bonus
    /// 
    /// # Arguments
    /// * `liquidator` - Address calling the liquidation (repaying debt)
    /// * `borrower` - Address being liquidated (underwater position)
    /// * `repay_asset` - Asset to repay (e.g., USDC)
    /// * `repay_amount` - Amount of debt to repay
    /// * `collateral_asset` - Collateral asset to seize (e.g., XLM)
    /// 
    /// # Returns
    /// Amount of collateral seized
    pub fn liquidate(
        env: Env,
        liquidator: Address,
        borrower: Address,
        repay_asset: Symbol,
        repay_amount: i128,
        collateral_asset: Symbol,
    ) -> i128 {
        liquidator.require_auth();
        
        if repay_amount <= 0 {
            panic!("Repay amount must be positive");
        }

        // ====================================================================
        // STEP 1: Check borrower's health factor
        // ====================================================================
        
        // Accrue interest first to get accurate debt
        Self::accrue_interest(&env, repay_asset.clone());
        
        let borrower_position = Self::get_user_position(env.clone(), borrower.clone());
        
        // Health factor must be < 1.0 to be liquidatable
        if borrower_position.health_factor >= SCALE {
            panic!("Position is healthy, cannot liquidate");
        }

        // ====================================================================
        // STEP 2: Calculate maximum repayable amount (close factor)
        // ====================================================================
        
        let borrower_debt = Self::get_user_debt_with_interest(&env, borrower.clone(), repay_asset.clone());
        
        if borrower_debt == 0 {
            panic!("Borrower has no debt in this asset");
        }
        
        // Maximum repayable = 50% of borrower's debt
        let max_repay = (borrower_debt * CLOSE_FACTOR) / SCALE;
        
        // Cap repay_amount to max allowed
        let actual_repay = if repay_amount > max_repay {
            max_repay
        } else {
            repay_amount
        };

        // ====================================================================
        // STEP 3: Calculate collateral to seize
        // ====================================================================
        
        let oracle: Address = env.storage().instance().get(&DataKey::PriceOracle).unwrap();
        
        // Get prices
        let repay_price = Self::get_asset_price(&env, &oracle, &repay_asset);
        let collateral_price = Self::get_asset_price(&env, &oracle, &collateral_asset);
        
        // Calculate repay value in USD
        let repay_value_usd = (actual_repay * repay_price) / SCALE;
        
        // Add liquidation bonus (5%)
        let bonus_value_usd = (repay_value_usd * LIQUIDATION_BONUS) / SCALE;
        let total_value_usd = repay_value_usd + bonus_value_usd;
        
        // Convert to collateral amount
        let collateral_to_seize = (total_value_usd * SCALE) / collateral_price;
        
        // Check borrower has sufficient collateral
        let borrower_collateral: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserCollateral(borrower.clone(), collateral_asset.clone()))
            .unwrap_or(0);
        
        if borrower_collateral < collateral_to_seize {
            panic!("Insufficient collateral to seize");
        }

        // ====================================================================
        // STEP 4: Execute liquidation
        // ====================================================================
        
        // Transfer repay_asset from liquidator to pool
        let repay_token: Address = env.storage().instance().get(&DataKey::TokenAddress(repay_asset.clone())).unwrap();
        let repay_token_client = token::Client::new(&env, &repay_token);
        repay_token_client.transfer(&liquidator, &env.current_contract_address(), &actual_repay);
        
        // Reduce borrower's debt
        let borrower_debt_principal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserDebt(borrower.clone(), repay_asset.clone()))
            .unwrap_or(0);
        let new_debt = if actual_repay >= borrower_debt {
            0
        } else {
            // Calculate new principal based on repayment
            let debt_reduction_ratio = (actual_repay * INITIAL_EXCHANGE_RATE) / borrower_debt;
            borrower_debt_principal - (borrower_debt_principal * debt_reduction_ratio) / INITIAL_EXCHANGE_RATE
        };
        env.storage()
            .persistent()
            .set(&DataKey::UserDebt(borrower.clone(), repay_asset.clone()), &new_debt);
        
        // Reduce total borrows
        let total_borrow: i128 = env.storage().instance().get(&DataKey::TotalBorrow(repay_asset.clone())).unwrap_or(0);
        let new_total_borrow = if total_borrow > actual_repay {
            total_borrow - actual_repay
        } else {
            0
        };
        env.storage().instance().set(&DataKey::TotalBorrow(repay_asset.clone()), &new_total_borrow);
        
        // Transfer collateral from borrower to liquidator
        let new_borrower_collateral = borrower_collateral - collateral_to_seize;
        env.storage()
            .persistent()
            .set(&DataKey::UserCollateral(borrower.clone(), collateral_asset.clone()), &new_borrower_collateral);
        
        // Transfer collateral tokens to liquidator
        let collateral_token: Address = env.storage().instance().get(&DataKey::TokenAddress(collateral_asset.clone())).unwrap();
        let collateral_token_client = token::Client::new(&env, &collateral_token);
        collateral_token_client.transfer(&env.current_contract_address(), &liquidator, &collateral_to_seize);

        // ====================================================================
        // STEP 5: Emit event and return
        // ====================================================================
        
        env.events().publish(
            (symbol_short!("liquidate"), liquidator, borrower),
            (actual_repay, collateral_to_seize)
        );

        collateral_to_seize
    }
}

#[cfg(test)]
mod test;
