#![no_std]

//! # Stellend Interest Rate Model Contract
//!
//! This contract implements a **variable interest rate model** for the Stellend lending protocol.
//! 
//! ## How It Works
//!
//! The interest rate is determined by the **utilization rate** of the pool:
//! - **Utilization Rate (U)** = Total Borrowed / Total Supplied
//! - As utilization increases, interest rates increase to:
//!   - Incentivize more deposits (higher supply APY)
//!   - Discourage excessive borrowing
//!
//! ## The Kinked Rate Model
//!
//! We use a "kinked" model with two slopes:
//! 
//! ```text
//! Rate
//!  ^
//!  |                          /
//!  |                        /  <- Slope2 (steep, 75%)
//!  |                      /
//!  |                    * <- Kink at optimal utilization (80%)
//!  |                  /
//!  |                /
//!  |              /  <- Slope1 (gentle, 4%)
//!  |            /
//!  |          /
//!  |--------*  <- Base Rate (0%)
//!  +-----------------------------------> Utilization
//!           0%       80%      100%
//! ```
//!
//! - Below optimal (80%): Rates increase slowly (slope1)
//! - Above optimal (80%): Rates increase steeply (slope2) to discourage over-utilization
//!
//! ## Default Parameters (Hackathon MVP)
//!
//! | Parameter | Value | Description |
//! |-----------|-------|-------------|
//! | Base Rate | 0% | Minimum borrow rate |
//! | Slope1 | 4% | Rate increase per 100% utilization below optimal |
//! | Slope2 | 75% | Rate increase per 100% utilization above optimal |
//! | Optimal | 80% | Target utilization rate |
//!
//! ## Example Rates
//!
//! | Utilization | Borrow APR | Supply APR |
//! |-------------|------------|------------|
//! | 0% | 0% | 0% |
//! | 40% | 2% | 0.8% |
//! | 80% | 4% | 3.2% |
//! | 90% | 41.5% | 37.35% |
//! | 100% | 79% | 79% |

use soroban_sdk::{contract, contractimpl, contracttype, Env};

// ============================================================================
// CONSTANTS
// ============================================================================

/// Scaling factor for percentages (1e7 = 10_000_000)
/// - 100% = 10_000_000
/// - 1% = 100_000
/// - 0.01% = 1_000
const SCALE: i128 = 10_000_000;

/// Seconds per year (365.25 days)
const SECONDS_PER_YEAR: i128 = 31_557_600;

// ============================================================================
// STORAGE
// ============================================================================

/// Storage keys for the interest rate model parameters
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    /// Base interest rate (scaled by 1e7)
    /// Default: 0 (0%)
    BaseRate,
    
    /// Multiplier for utilization BELOW optimal (scaled by 1e7)
    /// This is the "gentle" slope before the kink
    /// Default: 400_000 (4%)
    Slope1,
    
    /// Multiplier for utilization ABOVE optimal (scaled by 1e7)
    /// This is the "steep" slope after the kink
    /// Default: 7_500_000 (75%)
    Slope2,
    
    /// Optimal utilization rate - the "kink" point (scaled by 1e7)
    /// Default: 8_000_000 (80%)
    OptimalUtilization,
}

// ============================================================================
// CONTRACT
// ============================================================================

/// Stellend Interest Rate Model Contract
///
/// Calculates borrow and supply rates based on pool utilization.
/// Uses a kinked rate model to balance supply and demand.
#[contract]
pub struct InterestRateModel;

#[contractimpl]
impl InterestRateModel {
    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /// Initialize the interest rate model with custom parameters
    ///
    /// # Arguments
    /// * `base_rate` - Base interest rate (scaled by 1e7, e.g., 0% = 0)
    /// * `slope1` - Rate multiplier below optimal (scaled by 1e7, e.g., 4% = 400_000)
    /// * `slope2` - Rate multiplier above optimal (scaled by 1e7, e.g., 75% = 7_500_000)
    /// * `optimal_utilization` - Optimal utilization (scaled by 1e7, e.g., 80% = 8_000_000)
    ///
    /// # Example
    /// ```ignore
    /// // Initialize with: base=0%, slope1=4%, slope2=75%, optimal=80%
    /// client.initialize(&0, &400_000, &7_500_000, &8_000_000);
    /// ```
    pub fn initialize(
        env: Env,
        base_rate: i128,
        slope1: i128,
        slope2: i128,
        optimal_utilization: i128,
    ) {
        // Prevent re-initialization
        if env.storage().instance().has(&DataKey::BaseRate) {
            panic!("Already initialized");
        }

        // Validate optimal utilization is between 0% and 100%
        if optimal_utilization <= 0 || optimal_utilization >= SCALE {
            panic!("Invalid optimal utilization: must be between 0 and 100%");
        }

        // Store parameters
        env.storage().instance().set(&DataKey::BaseRate, &base_rate);
        env.storage().instance().set(&DataKey::Slope1, &slope1);
        env.storage().instance().set(&DataKey::Slope2, &slope2);
        env.storage().instance().set(&DataKey::OptimalUtilization, &optimal_utilization);
    }

    /// Initialize with default parameters for hackathon MVP
    ///
    /// Default values:
    /// - Base rate: 0%
    /// - Slope1: 4%
    /// - Slope2: 75%
    /// - Optimal: 80%
    pub fn initialize_default(env: Env) {
        Self::initialize(
            env,
            0,           // 0% base rate
            400_000,     // 4% slope1
            7_500_000,   // 75% slope2
            8_000_000,   // 80% optimal
        );
    }

    // ========================================================================
    // RATE CALCULATION - Main Functions for Pool Contract
    // ========================================================================

    /// Get the annualized borrow rate based on utilization
    ///
    /// This is the main function called by the Pool contract to determine
    /// how much interest borrowers pay.
    ///
    /// # Arguments
    /// * `utilization` - Current utilization rate (scaled by 1e7)
    ///   - Calculate as: (total_borrow * 10_000_000) / total_supply
    ///
    /// # Returns
    /// Annualized borrow rate (scaled by 1e7)
    /// - e.g., 500_000 = 5% APR
    ///
    /// # Formula
    /// ```text
    /// if utilization <= optimal:
    ///     rate = base_rate + (utilization / optimal) * slope1
    /// else:
    ///     rate = base_rate + slope1 + ((utilization - optimal) / (1 - optimal)) * slope2
    /// ```
    pub fn get_borrow_rate(env: Env, utilization: i128) -> i128 {
        let base_rate = Self::get_base_rate(env.clone());
        let slope1 = Self::get_slope1(env.clone());
        let slope2 = Self::get_slope2(env.clone());
        let optimal = Self::get_optimal_utilization(env);

        if utilization <= optimal {
            // Below or at optimal utilization
            // Rate increases linearly with slope1
            // rate = base_rate + (utilization / optimal) * slope1
            base_rate + (utilization * slope1) / optimal
        } else {
            // Above optimal utilization
            // Rate increases steeply with slope2
            // excess = (utilization - optimal) / (1 - optimal)
            // rate = base_rate + slope1 + excess * slope2
            let excess_utilization = ((utilization - optimal) * SCALE) / (SCALE - optimal);
            base_rate + slope1 + (excess_utilization * slope2) / SCALE
        }
    }

    /// Get the borrow rate per second (for interest accrual)
    ///
    /// This function is used by the Pool contract to calculate
    /// how much interest accrues per second.
    ///
    /// # Arguments
    /// * `utilization` - Current utilization rate (scaled by 1e7)
    ///
    /// # Returns
    /// Rate per second (scaled by 1e7)
    ///
    /// # Example
    /// If annual rate is 5% (500_000), per-second rate is:
    /// 500_000 / 31_557_600 ≈ 15.8 (scaled)
    pub fn get_borrow_rate_per_second(env: Env, utilization: i128) -> i128 {
        let annual_rate = Self::get_borrow_rate(env, utilization);
        annual_rate / SECONDS_PER_YEAR
    }

    /// Get the annualized supply rate based on utilization
    ///
    /// The supply rate is what suppliers earn. It's derived from:
    /// supply_rate = borrow_rate * utilization * (1 - reserve_factor)
    ///
    /// For MVP, we assume reserve_factor = 0, so:
    /// supply_rate = borrow_rate * utilization
    ///
    /// # Arguments
    /// * `utilization` - Current utilization rate (scaled by 1e7)
    ///
    /// # Returns
    /// Annualized supply rate (scaled by 1e7)
    pub fn get_supply_rate(env: Env, utilization: i128) -> i128 {
        let borrow_rate = Self::get_borrow_rate(env, utilization);
        // Supply rate = borrow_rate * utilization (no reserve factor for MVP)
        (borrow_rate * utilization) / SCALE
    }

    /// Get the supply rate per second
    ///
    /// # Arguments
    /// * `utilization` - Current utilization rate (scaled by 1e7)
    ///
    /// # Returns
    /// Rate per second (scaled by 1e7)
    pub fn get_supply_rate_per_second(env: Env, utilization: i128) -> i128 {
        let annual_rate = Self::get_supply_rate(env, utilization);
        annual_rate / SECONDS_PER_YEAR
    }

    // ========================================================================
    // PARAMETER GETTERS
    // ========================================================================

    /// Get the current base rate
    pub fn get_base_rate(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::BaseRate).unwrap_or(0)
    }

    /// Get the slope1 parameter (below optimal)
    pub fn get_slope1(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Slope1).unwrap_or(400_000)
    }

    /// Get the slope2 parameter (above optimal)
    pub fn get_slope2(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Slope2).unwrap_or(7_500_000)
    }

    /// Get the optimal utilization rate
    pub fn get_optimal_utilization(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::OptimalUtilization).unwrap_or(8_000_000)
    }

    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================

    /// Calculate utilization rate from supply and borrow amounts
    ///
    /// This is a helper function that calculates:
    /// utilization = total_borrow / total_supply
    ///
    /// # Arguments
    /// * `total_supply` - Total assets supplied to the pool
    /// * `total_borrow` - Total assets borrowed from the pool
    ///
    /// # Returns
    /// Utilization rate (scaled by 1e7)
    pub fn calculate_utilization(_env: Env, total_supply: i128, total_borrow: i128) -> i128 {
        if total_supply == 0 {
            return 0;
        }
        (total_borrow * SCALE) / total_supply
    }

    /// Get all current parameters as a tuple
    ///
    /// Returns: (base_rate, slope1, slope2, optimal_utilization)
    pub fn get_parameters(env: Env) -> (i128, i128, i128, i128) {
        (
            Self::get_base_rate(env.clone()),
            Self::get_slope1(env.clone()),
            Self::get_slope2(env.clone()),
            Self::get_optimal_utilization(env),
        )
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);

        // Initialize with custom parameters
        client.initialize(&0, &400_000, &7_500_000, &8_000_000);

        assert_eq!(client.get_base_rate(), 0);
        assert_eq!(client.get_slope1(), 400_000);
        assert_eq!(client.get_slope2(), 7_500_000);
        assert_eq!(client.get_optimal_utilization(), 8_000_000);
    }

    #[test]
    fn test_initialize_default() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);

        client.initialize_default();

        // Check default values
        assert_eq!(client.get_base_rate(), 0);
        assert_eq!(client.get_slope1(), 400_000);      // 4%
        assert_eq!(client.get_slope2(), 7_500_000);   // 75%
        assert_eq!(client.get_optimal_utilization(), 8_000_000); // 80%
    }

    #[test]
    fn test_borrow_rate_zero_utilization() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 0% utilization, rate should be base rate (0%)
        let rate = client.get_borrow_rate(&0);
        assert_eq!(rate, 0);
    }

    #[test]
    fn test_borrow_rate_below_optimal() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 40% utilization (half of 80% optimal)
        // Rate = 0% + (40% / 80%) * 4% = 2%
        let rate = client.get_borrow_rate(&4_000_000);
        assert_eq!(rate, 200_000); // 2%

        // At 80% utilization (optimal)
        // Rate = 0% + (80% / 80%) * 4% = 4%
        let rate = client.get_borrow_rate(&8_000_000);
        assert_eq!(rate, 400_000); // 4%
    }

    #[test]
    fn test_borrow_rate_above_optimal() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 90% utilization
        // excess = (90% - 80%) / (100% - 80%) = 50%
        // Rate = 0% + 4% + 50% * 75% = 41.5%
        let rate = client.get_borrow_rate(&9_000_000);
        assert_eq!(rate, 4_150_000); // 41.5%

        // At 100% utilization
        // excess = 100%
        // Rate = 0% + 4% + 100% * 75% = 79%
        let rate = client.get_borrow_rate(&10_000_000);
        assert_eq!(rate, 7_900_000); // 79%
    }

    #[test]
    fn test_supply_rate() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 80% utilization, borrow rate = 4%
        // Supply rate = 4% * 80% = 3.2%
        let supply_rate = client.get_supply_rate(&8_000_000);
        assert_eq!(supply_rate, 320_000); // 3.2%
    }

    #[test]
    fn test_rate_per_second() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 80% utilization, annual rate = 4%
        let annual_rate = client.get_borrow_rate(&8_000_000);
        let per_second_rate = client.get_borrow_rate_per_second(&8_000_000);

        // Per-second should be annual / seconds_per_year
        assert_eq!(per_second_rate, annual_rate / SECONDS_PER_YEAR);
    }

    #[test]
    fn test_calculate_utilization() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);

        // 80 borrowed out of 100 supplied = 80% utilization
        let util = client.calculate_utilization(&100, &80);
        assert_eq!(util, 8_000_000); // 80%

        // 0 supplied = 0% utilization (avoid divide by zero)
        let util = client.calculate_utilization(&0, &80);
        assert_eq!(util, 0);
    }

    #[test]
    fn test_get_parameters() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        let (base, s1, s2, optimal) = client.get_parameters();
        assert_eq!(base, 0);
        assert_eq!(s1, 400_000);
        assert_eq!(s2, 7_500_000);
        assert_eq!(optimal, 8_000_000);
    }
}
