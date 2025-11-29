#![no_std]

//! # Stellend Price Oracle Contract
//!
//! This contract provides on-chain price feeds for the Stellend lending protocol.
//! Prices are updated by an authorized keeper (off-chain script) that fetches
//! prices from external sources like CoinGecko.
//!
//! ## Features
//!
//! - **Admin-only price updates**: Only authorized keeper can set prices
//! - **Staleness checks**: Prices can be verified as fresh
//! - **Chaos mode**: 50% price crash simulation for demos
//! - **Multiple assets**: Supports XLM, USDC, and extensible for more
//!
//! ## Price Scaling
//!
//! All prices are scaled by 1e7 (10,000,000):
//! - $1.00 = 10,000,000
//! - $0.30 = 3,000,000
//! - $0.15 = 1,500,000
//!
//! ## Demo Flow
//!
//! 1. Deploy oracle, initialize with admin
//! 2. Keeper script calls `set_price(XLM, price)` periodically
//! 3. Pool contract calls `get_price(XLM)` to value collateral
//! 4. For crash demo: keeper calls `set_price(XLM, price * 0.5)` or uses --crash flag

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

// ============================================================================
// CONSTANTS
// ============================================================================

/// Scaling factor for prices (1e7 = 10_000_000)
/// - $1.00 = 10_000_000
/// - $0.01 = 100_000
const PRICE_SCALE: i128 = 10_000_000;

/// Default staleness threshold: 1 hour (3600 seconds)
const DEFAULT_STALENESS_THRESHOLD: u64 = 3600;

/// Asset symbols
pub const XLM: Symbol = symbol_short!("XLM");
pub const USDC: Symbol = symbol_short!("USDC");

// ============================================================================
// STORAGE
// ============================================================================

/// Storage keys for the price oracle
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    /// Admin/keeper address authorized to update prices
    Admin,
    /// Price for an asset (scaled by 1e7)
    Price(Symbol),
    /// Last update timestamp for an asset
    LastUpdate(Symbol),
    /// Staleness threshold in seconds
    StalenessThreshold,
}

// ============================================================================
// CONTRACT
// ============================================================================

/// Stellend Price Oracle Contract
///
/// Stores and serves price data for assets used in the lending protocol.
#[contract]
pub struct PriceOracle;

#[contractimpl]
impl PriceOracle {
    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /// Initialize the price oracle
    ///
    /// # Arguments
    /// * `admin` - Address authorized to update prices (keeper wallet)
    ///
    /// # Initial State
    /// - USDC price set to $1.00 (stablecoin)
    /// - XLM price unset (must be set by keeper)
    /// - Staleness threshold: 1 hour
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }

        // Store admin
        env.storage().instance().set(&DataKey::Admin, &admin);

        // Set staleness threshold
        env.storage()
            .instance()
            .set(&DataKey::StalenessThreshold, &DEFAULT_STALENESS_THRESHOLD);

        // Initialize USDC to $1.00 (stablecoin assumption)
        env.storage()
            .instance()
            .set(&DataKey::Price(USDC), &PRICE_SCALE);
        env.storage()
            .instance()
            .set(&DataKey::LastUpdate(USDC), &env.ledger().timestamp());

        // Emit initialization event
        env.events().publish((symbol_short!("init"),), admin);
    }

    // ========================================================================
    // PRICE UPDATES (Admin Only)
    // ========================================================================

    /// Set price for an asset
    ///
    /// Only callable by the admin/keeper address.
    ///
    /// # Arguments
    /// * `asset` - Asset symbol (e.g., XLM, USDC)
    /// * `price` - Price in USD scaled by 1e7 (e.g., $0.30 = 3_000_000)
    ///
    /// # Events
    /// Emits `("set_price", asset)` with the new price
    pub fn set_price(env: Env, asset: Symbol, price: i128) {
        // Verify admin authorization
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        if price <= 0 {
            panic!("Price must be positive");
        }

        // Store price and timestamp
        env.storage()
            .instance()
            .set(&DataKey::Price(asset.clone()), &price);
        env.storage()
            .instance()
            .set(&DataKey::LastUpdate(asset.clone()), &env.ledger().timestamp());

        // Emit event for indexers/UI
        env.events().publish((symbol_short!("set_price"), asset), price);
    }

    /// Set multiple prices in a single transaction
    ///
    /// More efficient for updating XLM and USDC together.
    ///
    /// # Arguments
    /// * `xlm_price` - XLM price in USD (scaled by 1e7)
    /// * `usdc_price` - USDC price in USD (scaled by 1e7, typically 10_000_000)
    pub fn set_prices(env: Env, xlm_price: i128, usdc_price: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        if xlm_price <= 0 || usdc_price <= 0 {
            panic!("Prices must be positive");
        }

        let timestamp = env.ledger().timestamp();

        // Set XLM
        env.storage().instance().set(&DataKey::Price(XLM), &xlm_price);
        env.storage().instance().set(&DataKey::LastUpdate(XLM), &timestamp);

        // Set USDC
        env.storage().instance().set(&DataKey::Price(USDC), &usdc_price);
        env.storage().instance().set(&DataKey::LastUpdate(USDC), &timestamp);

        // Emit events
        env.events().publish((symbol_short!("set_price"), XLM), xlm_price);
        env.events().publish((symbol_short!("set_price"), USDC), usdc_price);
    }

    /// Simulate a price crash (50% drop) for demo purposes
    ///
    /// This is a convenience function for the chaos mode demo.
    /// It takes the CURRENT price and halves it.
    ///
    /// # Arguments
    /// * `asset` - Asset to crash (typically XLM)
    ///
    /// # Events
    /// Emits `("crash", asset)` with the crashed price
    pub fn crash_price(env: Env, asset: Symbol) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let current_price: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Price(asset.clone()))
            .unwrap_or(0);

        if current_price == 0 {
            panic!("Cannot crash: price not set");
        }

        // Apply 50% reduction
        let crashed_price = current_price / 2;

        env.storage()
            .instance()
            .set(&DataKey::Price(asset.clone()), &crashed_price);
        env.storage()
            .instance()
            .set(&DataKey::LastUpdate(asset.clone()), &env.ledger().timestamp());

        // Emit crash event
        env.events()
            .publish((symbol_short!("crash"), asset), crashed_price);
    }

    // ========================================================================
    // PRICE QUERIES (Public)
    // ========================================================================

    /// Get current price for an asset
    ///
    /// # Arguments
    /// * `asset` - Asset symbol
    ///
    /// # Returns
    /// Price in USD (scaled by 1e7), or 0 if not set
    pub fn get_price(env: Env, asset: Symbol) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Price(asset))
            .unwrap_or(0)
    }

    /// Get price with staleness check
    ///
    /// Use this in production to ensure prices are fresh.
    ///
    /// # Panics
    /// - If price is not set
    /// - If price is stale (older than staleness threshold)
    pub fn get_price_safe(env: Env, asset: Symbol) -> i128 {
        let price: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Price(asset.clone()))
            .unwrap_or(0);

        if price == 0 {
            panic!("Price not set for asset");
        }

        let last_update: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LastUpdate(asset))
            .unwrap_or(0);

        let threshold: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StalenessThreshold)
            .unwrap_or(DEFAULT_STALENESS_THRESHOLD);

        let current_time = env.ledger().timestamp();
        if current_time > last_update && current_time - last_update > threshold {
            panic!("Price is stale");
        }

        price
    }

    /// Get timestamp of last price update
    pub fn get_last_update(env: Env, asset: Symbol) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::LastUpdate(asset))
            .unwrap_or(0)
    }

    /// Check if price is stale
    pub fn is_stale(env: Env, asset: Symbol) -> bool {
        let last_update: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LastUpdate(asset))
            .unwrap_or(0);

        let threshold: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StalenessThreshold)
            .unwrap_or(DEFAULT_STALENESS_THRESHOLD);

        let current_time = env.ledger().timestamp();
        current_time > last_update && current_time - last_update > threshold
    }

    // ========================================================================
    // CONVENIENCE FUNCTIONS
    // ========================================================================

    /// Get XLM price
    pub fn get_xlm_price(env: Env) -> i128 {
        Self::get_price(env, XLM)
    }

    /// Get USDC price
    pub fn get_usdc_price(env: Env) -> i128 {
        Self::get_price(env, USDC)
    }

    /// Convert XLM amount to USD value
    ///
    /// # Arguments
    /// * `xlm_amount` - Amount of XLM (in base units, 1e7 stroops per XLM)
    ///
    /// # Returns
    /// USD value (scaled by 1e7)
    pub fn xlm_to_usd(env: Env, xlm_amount: i128) -> i128 {
        let price = Self::get_price(env, XLM);
        if price == 0 {
            return 0;
        }
        (xlm_amount * price) / PRICE_SCALE
    }

    /// Convert USD value to XLM amount
    ///
    /// # Arguments
    /// * `usd_amount` - USD value (scaled by 1e7)
    ///
    /// # Returns
    /// XLM amount (in base units)
    pub fn usd_to_xlm(env: Env, usd_amount: i128) -> i128 {
        let price = Self::get_price(env, XLM);
        if price == 0 {
            panic!("XLM price not set");
        }
        (usd_amount * PRICE_SCALE) / price
    }

    /// Get both XLM and USDC prices
    ///
    /// # Returns
    /// (xlm_price, usdc_price) - both scaled by 1e7
    pub fn get_all_prices(env: Env) -> (i128, i128) {
        let xlm = Self::get_price(env.clone(), XLM);
        let usdc = Self::get_price(env, USDC);
        (xlm, usdc)
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    /// Get current admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    /// Transfer admin role
    ///
    /// # Arguments
    /// * `new_admin` - New admin address
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.events().publish((symbol_short!("new_admin"),), new_admin);
    }

    /// Set staleness threshold
    ///
    /// # Arguments
    /// * `threshold` - New threshold in seconds
    pub fn set_staleness_threshold(env: Env, threshold: u64) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::StalenessThreshold, &threshold);
    }

    /// Get staleness threshold
    pub fn get_staleness_threshold(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::StalenessThreshold)
            .unwrap_or(DEFAULT_STALENESS_THRESHOLD)
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register_contract(None, PriceOracle);
        let client = PriceOracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_usdc_price(), PRICE_SCALE); // $1.00
        assert_eq!(client.get_xlm_price(), 0); // Not set yet
    }

    #[test]
    fn test_set_and_get_price() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PriceOracle);
        let client = PriceOracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Set XLM price to $0.30
        client.set_price(&XLM, &3_000_000);

        assert_eq!(client.get_xlm_price(), 3_000_000);
        assert_eq!(client.get_price(&XLM), 3_000_000);
    }

    #[test]
    fn test_set_prices_batch() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PriceOracle);
        let client = PriceOracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Set both prices at once
        client.set_prices(&3_000_000, &10_000_000);

        assert_eq!(client.get_xlm_price(), 3_000_000);
        assert_eq!(client.get_usdc_price(), 10_000_000);

        let (xlm, usdc) = client.get_all_prices();
        assert_eq!(xlm, 3_000_000);
        assert_eq!(usdc, 10_000_000);
    }

    #[test]
    fn test_crash_price() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PriceOracle);
        let client = PriceOracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Set XLM to $0.30
        client.set_price(&XLM, &3_000_000);
        assert_eq!(client.get_xlm_price(), 3_000_000);

        // Crash it (50% drop)
        client.crash_price(&XLM);
        assert_eq!(client.get_xlm_price(), 1_500_000); // $0.15
    }

    #[test]
    fn test_xlm_to_usd_conversion() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PriceOracle);
        let client = PriceOracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Set XLM to $0.30
        client.set_price(&XLM, &3_000_000);

        // 100 XLM = $30
        let xlm_amount: i128 = 100 * PRICE_SCALE;
        let usd_value = client.xlm_to_usd(&xlm_amount);
        assert_eq!(usd_value, 30 * PRICE_SCALE);
    }

    #[test]
    fn test_usd_to_xlm_conversion() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PriceOracle);
        let client = PriceOracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Set XLM to $0.30
        client.set_price(&XLM, &3_000_000);

        // $30 = 100 XLM
        let usd_amount: i128 = 30 * PRICE_SCALE;
        let xlm_value = client.usd_to_xlm(&usd_amount);
        assert_eq!(xlm_value, 100 * PRICE_SCALE);
    }

    #[test]
    #[should_panic(expected = "Already initialized")]
    fn test_double_initialize() {
        let env = Env::default();
        let contract_id = env.register_contract(None, PriceOracle);
        let client = PriceOracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin); // Should panic
    }

    #[test]
    #[should_panic(expected = "Price must be positive")]
    fn test_zero_price() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PriceOracle);
        let client = PriceOracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.set_price(&XLM, &0); // Should panic
    }
}
