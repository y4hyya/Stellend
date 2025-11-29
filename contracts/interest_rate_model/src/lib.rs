#![no_std]

//! # Stellend Interest Rate Model Contract
//!
//! This contract implements a **multi-kink interest rate model** inspired by
//! [Drift Protocol](https://docs.drift.trade/lend-borrow/borrow-interest-rate).
//!
//! ## How It Works
//!
//! The interest rate is determined by the **utilization rate** of the pool:
//! - **Utilization Rate (U)** = Total Borrowed / Total Supplied
//! - Low utilization → Low rates to encourage borrowing
//! - High utilization → High rates to encourage deposits and repayments
//!
//! ## Multi-Kink Model
//!
//! Unlike simple two-slope models, the multi-kink model uses increasingly steep
//! rate curves as utilization approaches 100%. This protects liquidity while
//! allowing efficient capital utilization.
//!
//! ```text
//! Rate
//!  ^
//!  |                                    ╱ R_max
//!  |                                  ╱
//!  |                               ╱    <- Very steep (95-100%)
//!  |                            ╱
//!  |                         ╱          <- Steep (90-95%)
//!  |                      ╱
//!  |                   ╱                <- Moderate (85-90%)
//!  |               . *                  <- Mild penalty (U*-85%)
//!  |            .   
//!  |         .      <- Linear (0 to U*)
//!  |      .
//!  |   . 
//!  |. R_min
//!  +──────────────────────────────────────> Utilization
//!  0%   U*(80%)  85%  90%  95%  99% 100%
//! ```
//!
//! ## Rate Curve Behavior (from Drift Protocol)
//!
//! | Utilization (U) | Rate Curve Behavior              |
//! |-----------------|----------------------------------|
//! | U ≤ U*          | Linear ramp to R_opt             |
//! | U* to 85%       | Mild penalty (+50 bps of ΔR)     |
//! | 85% to 90%      | Steeper slope (+100 bps)         |
//! | 90% to 95%      | Steeper still (+150 bps)         |
//! | 95% to 99%      | Aggressive slope (+200 bps)      |
//! | 99% to 100%     | Max slope (+500 bps)             |
//!
//! Where: ΔR = R_max - R_opt
//!
//! ## Default Parameters
//!
//! | Parameter | Value | Description |
//! |-----------|-------|-------------|
//! | R_min | 0% | Minimum borrow rate |
//! | R_opt | 4% | Rate at optimal utilization |
//! | R_max | 100% | Maximum rate at 100% utilization |
//! | U* | 80% | Optimal/target utilization |

use soroban_sdk::{contract, contractimpl, contracttype, Env};

// ============================================================================
// CONSTANTS
// ============================================================================

/// Scaling factor for percentages (1e7 = 10_000_000)
/// - 100% = 10_000_000
/// - 1% = 100_000
/// - 0.01% = 1_000 (1 basis point)
const SCALE: i128 = 10_000_000;

/// Seconds per year (365.25 days)
const SECONDS_PER_YEAR: i128 = 31_557_600;

/// Utilization thresholds (scaled by SCALE)
const U_85: i128 = 8_500_000;  // 85%
const U_90: i128 = 9_000_000;  // 90%
const U_95: i128 = 9_500_000;  // 95%
const U_99: i128 = 9_900_000;  // 99%

// ============================================================================
// STORAGE
// ============================================================================

/// Storage keys for the interest rate model parameters
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    /// Minimum interest rate (floor)
    /// Scaled by 1e7, e.g., 0% = 0
    RateMin,
    
    /// Optimal interest rate (at U*)
    /// Scaled by 1e7, e.g., 4% = 400_000
    RateOpt,
    
    /// Maximum interest rate (at 100% utilization)
    /// Scaled by 1e7, e.g., 100% = 10_000_000
    RateMax,
    
    /// Optimal utilization rate (U*)
    /// Scaled by 1e7, e.g., 80% = 8_000_000
    OptimalUtilization,
}

// ============================================================================
// CONTRACT
// ============================================================================

/// Stellend Interest Rate Model Contract
///
/// Implements Drift Protocol's multi-kink interest rate model.
/// Calculates borrow and supply rates based on pool utilization.
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
    /// * `rate_min` - Minimum rate floor (scaled by 1e7)
    /// * `rate_opt` - Rate at optimal utilization (scaled by 1e7)
    /// * `rate_max` - Maximum rate at 100% utilization (scaled by 1e7)
    /// * `optimal_utilization` - Optimal utilization U* (scaled by 1e7)
    ///
    /// # Example
    /// ```ignore
    /// // R_min=0%, R_opt=4%, R_max=100%, U*=80%
    /// client.initialize(&0, &400_000, &10_000_000, &8_000_000);
    /// ```
    pub fn initialize(
        env: Env,
        rate_min: i128,
        rate_opt: i128,
        rate_max: i128,
        optimal_utilization: i128,
    ) {
        // Prevent re-initialization
        if env.storage().instance().has(&DataKey::RateMin) {
            panic!("Already initialized");
        }

        // Validate parameters
        if optimal_utilization <= 0 || optimal_utilization >= SCALE {
            panic!("Invalid optimal utilization: must be between 0 and 100%");
        }
        if rate_opt < rate_min {
            panic!("Rate optimal must be >= rate min");
        }
        if rate_max < rate_opt {
            panic!("Rate max must be >= rate optimal");
        }

        // Store parameters
        env.storage().instance().set(&DataKey::RateMin, &rate_min);
        env.storage().instance().set(&DataKey::RateOpt, &rate_opt);
        env.storage().instance().set(&DataKey::RateMax, &rate_max);
        env.storage().instance().set(&DataKey::OptimalUtilization, &optimal_utilization);
    }

    /// Initialize with default parameters for Stellend MVP
    ///
    /// Default values:
    /// - R_min: 0%
    /// - R_opt: 4% (at 80% utilization)
    /// - R_max: 100% (at 100% utilization)
    /// - U*: 80%
    pub fn initialize_default(env: Env) {
        Self::initialize(
            env,
            0,             // 0% minimum rate
            400_000,       // 4% optimal rate
            10_000_000,    // 100% max rate
            8_000_000,     // 80% optimal utilization
        );
    }

    // ========================================================================
    // RATE CALCULATION - Multi-Kink Model (Drift Protocol inspired)
    // ========================================================================

    /// Get the annualized borrow rate based on utilization
    ///
    /// Implements Drift Protocol's multi-kink interest rate formula:
    /// 
    /// - U ≤ U*: Linear ramp from R_min to R_opt
    /// - U* to 85%: +5% of ΔR (mild penalty)
    /// - 85% to 90%: +10% of ΔR 
    /// - 90% to 95%: +15% of ΔR
    /// - 95% to 99%: +20% of ΔR
    /// - 99% to 100%: +50% of ΔR (very steep)
    ///
    /// Where ΔR = R_max - R_opt
    ///
    /// # Arguments
    /// * `utilization` - Current utilization rate (scaled by 1e7)
    ///
    /// # Returns
    /// Annualized borrow rate (scaled by 1e7)
    pub fn get_borrow_rate(env: Env, utilization: i128) -> i128 {
        let rate_min = Self::get_rate_min(env.clone());
        let rate_opt = Self::get_rate_opt(env.clone());
        let rate_max = Self::get_rate_max(env.clone());
        let u_optimal = Self::get_optimal_utilization(env);

        // ΔR = difference between max and optimal rate
        let delta_r = rate_max - rate_opt;

        // Calculate raw rate based on utilization
        let raw_rate = if utilization <= u_optimal {
            // ================================================================
            // ZONE 1: Linear ramp from 0 to U*
            // ================================================================
            // Rate = R_opt * (U / U*)
            // At U=0: rate = 0
            // At U=U*: rate = R_opt
            (rate_opt * utilization) / u_optimal
            
        } else if utilization <= U_85 {
            // ================================================================
            // ZONE 2: Mild penalty (U* to 85%)
            // ================================================================
            // Adds 5% of ΔR over this range
            let range = U_85 - u_optimal;
            let progress = utilization - u_optimal;
            let penalty = (delta_r * 50 * progress) / (range * 1000);
            rate_opt + penalty
            
        } else if utilization <= U_90 {
            // ================================================================
            // ZONE 3: Steeper slope (85% to 90%)
            // ================================================================
            // Adds 10% of ΔR over this range
            let base_penalty = (delta_r * 50) / 1000; // From zone 2
            let range = U_90 - U_85;
            let progress = utilization - U_85;
            let extra_penalty = (delta_r * 100 * progress) / (range * 1000);
            rate_opt + base_penalty + extra_penalty
            
        } else if utilization <= U_95 {
            // ================================================================
            // ZONE 4: Even steeper (90% to 95%)
            // ================================================================
            // Adds 15% of ΔR over this range
            let base_penalty = (delta_r * 150) / 1000; // From zones 2+3
            let range = U_95 - U_90;
            let progress = utilization - U_90;
            let extra_penalty = (delta_r * 150 * progress) / (range * 1000);
            rate_opt + base_penalty + extra_penalty
            
        } else if utilization <= U_99 {
            // ================================================================
            // ZONE 5: Aggressive slope (95% to 99%)
            // ================================================================
            // Adds 20% of ΔR over this range
            let base_penalty = (delta_r * 300) / 1000; // From zones 2+3+4
            let range = U_99 - U_95;
            let progress = utilization - U_95;
            let extra_penalty = (delta_r * 200 * progress) / (range * 1000);
            rate_opt + base_penalty + extra_penalty
            
        } else {
            // ================================================================
            // ZONE 6: Maximum slope (99% to 100%)
            // ================================================================
            // Adds remaining 50% of ΔR over this tiny range
            let base_penalty = (delta_r * 500) / 1000; // From zones 2+3+4+5
            let range = SCALE - U_99;
            let progress = if utilization >= SCALE { range } else { utilization - U_99 };
            let extra_penalty = (delta_r * 500 * progress) / (range * 1000);
            rate_opt + base_penalty + extra_penalty
        };

        // Apply minimum rate floor
        if raw_rate < rate_min {
            rate_min
        } else {
            raw_rate
        }
    }

    /// Get the borrow rate per second (for interest accrual)
    ///
    /// # Arguments
    /// * `utilization` - Current utilization rate (scaled by 1e7)
    ///
    /// # Returns
    /// Rate per second (scaled by 1e7)
    pub fn get_borrow_rate_per_second(env: Env, utilization: i128) -> i128 {
        let annual_rate = Self::get_borrow_rate(env, utilization);
        annual_rate / SECONDS_PER_YEAR
    }

    /// Get the annualized supply rate based on utilization
    ///
    /// Supply rate = Borrow rate × Utilization × (1 - Reserve Factor)
    /// For MVP, we assume reserve_factor = 10%
    ///
    /// # Arguments
    /// * `utilization` - Current utilization rate (scaled by 1e7)
    ///
    /// # Returns
    /// Annualized supply rate (scaled by 1e7)
    pub fn get_supply_rate(env: Env, utilization: i128) -> i128 {
        let borrow_rate = Self::get_borrow_rate(env, utilization);
        // Supply rate = borrow_rate * utilization * 90% (10% to reserves)
        (borrow_rate * utilization * 9) / (SCALE * 10)
    }

    /// Get the supply rate per second
    pub fn get_supply_rate_per_second(env: Env, utilization: i128) -> i128 {
        let annual_rate = Self::get_supply_rate(env, utilization);
        annual_rate / SECONDS_PER_YEAR
    }

    // ========================================================================
    // PARAMETER GETTERS
    // ========================================================================

    /// Get the minimum rate (floor)
    pub fn get_rate_min(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::RateMin).unwrap_or(0)
    }

    /// Get the optimal rate (at U*)
    pub fn get_rate_opt(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::RateOpt).unwrap_or(400_000)
    }

    /// Get the maximum rate (at 100%)
    pub fn get_rate_max(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::RateMax).unwrap_or(10_000_000)
    }

    /// Get the optimal utilization rate (U*)
    pub fn get_optimal_utilization(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::OptimalUtilization).unwrap_or(8_000_000)
    }

    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================

    /// Calculate utilization rate from supply and borrow amounts
    pub fn calculate_utilization(_env: Env, total_supply: i128, total_borrow: i128) -> i128 {
        if total_supply == 0 {
            return 0;
        }
        (total_borrow * SCALE) / total_supply
    }

    /// Get all current parameters
    /// Returns: (rate_min, rate_opt, rate_max, optimal_utilization)
    pub fn get_parameters(env: Env) -> (i128, i128, i128, i128) {
        (
            Self::get_rate_min(env.clone()),
            Self::get_rate_opt(env.clone()),
            Self::get_rate_max(env.clone()),
            Self::get_optimal_utilization(env),
        )
    }

    // ========================================================================
    // LEGACY COMPATIBILITY (for Pool contract)
    // ========================================================================

    /// Legacy getter for backwards compatibility
    pub fn get_base_rate(env: Env) -> i128 {
        Self::get_rate_min(env)
    }

    /// Legacy getter - returns rate_opt as "slope1" equivalent
    pub fn get_slope1(env: Env) -> i128 {
        Self::get_rate_opt(env)
    }

    /// Legacy getter - returns (rate_max - rate_opt) as "slope2" equivalent  
    pub fn get_slope2(env: Env) -> i128 {
        let rate_opt = Self::get_rate_opt(env.clone());
        let rate_max = Self::get_rate_max(env);
        rate_max - rate_opt
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

        // R_min=0%, R_opt=4%, R_max=100%, U*=80%
        client.initialize(&0, &400_000, &10_000_000, &8_000_000);

        assert_eq!(client.get_rate_min(), 0);
        assert_eq!(client.get_rate_opt(), 400_000);
        assert_eq!(client.get_rate_max(), 10_000_000);
        assert_eq!(client.get_optimal_utilization(), 8_000_000);
    }

    #[test]
    fn test_initialize_default() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);

        client.initialize_default();

        assert_eq!(client.get_rate_min(), 0);
        assert_eq!(client.get_rate_opt(), 400_000);      // 4%
        assert_eq!(client.get_rate_max(), 10_000_000);   // 100%
        assert_eq!(client.get_optimal_utilization(), 8_000_000); // 80%
    }

    #[test]
    fn test_rate_at_zero_utilization() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 0% utilization, rate should be 0
        let rate = client.get_borrow_rate(&0);
        assert_eq!(rate, 0);
    }

    #[test]
    fn test_rate_at_optimal_utilization() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 80% utilization (optimal), rate should be R_opt = 4%
        let rate = client.get_borrow_rate(&8_000_000);
        assert_eq!(rate, 400_000); // 4%
    }

    #[test]
    fn test_rate_below_optimal() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 40% utilization (half of optimal)
        // Rate = R_opt * (40% / 80%) = 4% * 0.5 = 2%
        let rate = client.get_borrow_rate(&4_000_000);
        assert_eq!(rate, 200_000); // 2%

        // At 60% utilization
        // Rate = R_opt * (60% / 80%) = 4% * 0.75 = 3%
        let rate = client.get_borrow_rate(&6_000_000);
        assert_eq!(rate, 300_000); // 3%
    }

    #[test]
    fn test_rate_above_optimal_zone2() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 85% utilization (end of zone 2)
        // Should be R_opt + 5% of ΔR = 4% + 5% * 96% = 4% + 4.8% = 8.8%
        let rate = client.get_borrow_rate(&8_500_000);
        // ΔR = 100% - 4% = 96%, 5% of that = 4.8%
        // Total = 4% + 4.8% = 8.8% = 880_000
        assert_eq!(rate, 880_000); // ~8.8%
    }

    #[test]
    fn test_rate_at_90_percent() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 90% utilization (end of zone 3)
        // R_opt + (5% + 10%) of ΔR = 4% + 15% * 96% = 4% + 14.4% = 18.4%
        let rate = client.get_borrow_rate(&9_000_000);
        assert_eq!(rate, 1_840_000); // 18.4%
    }

    #[test]
    fn test_rate_at_95_percent() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 95% utilization (end of zone 4)
        // R_opt + (5% + 10% + 15%) of ΔR = 4% + 30% * 96% = 4% + 28.8% = 32.8%
        let rate = client.get_borrow_rate(&9_500_000);
        assert_eq!(rate, 3_280_000); // 32.8%
    }

    #[test]
    fn test_rate_at_99_percent() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 99% utilization (end of zone 5)
        // R_opt + (5% + 10% + 15% + 20%) of ΔR = 4% + 50% * 96% = 4% + 48% = 52%
        let rate = client.get_borrow_rate(&9_900_000);
        assert_eq!(rate, 5_200_000); // 52%
    }

    #[test]
    fn test_rate_at_100_percent() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 100% utilization (max)
        // R_opt + 100% of ΔR = 4% + 96% = 100%
        let rate = client.get_borrow_rate(&10_000_000);
        assert_eq!(rate, 10_000_000); // 100%
    }

    #[test]
    fn test_supply_rate() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // At 80% utilization, borrow rate = 4%
        // Supply rate = 4% * 80% * 90% = 2.88%
        let supply_rate = client.get_supply_rate(&8_000_000);
        assert_eq!(supply_rate, 288_000); // 2.88%
    }

    #[test]
    fn test_calculate_utilization() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);

        // 80 borrowed out of 100 supplied = 80% utilization
        let util = client.calculate_utilization(&100, &80);
        assert_eq!(util, 8_000_000); // 80%

        // 0 supplied = 0% utilization
        let util = client.calculate_utilization(&0, &80);
        assert_eq!(util, 0);
    }

    #[test]
    fn test_rate_curve_is_monotonic() {
        let env = Env::default();
        let contract_id = env.register_contract(None, InterestRateModel);
        let client = InterestRateModelClient::new(&env, &contract_id);
        client.initialize_default();

        // Verify rate always increases with utilization
        let mut prev_rate: i128 = 0;
        for u in (0..=100).step_by(5) {
            let utilization = u * 100_000; // Convert to scaled value
            let rate = client.get_borrow_rate(&utilization);
            assert!(rate >= prev_rate, "Rate should be monotonically increasing");
            prev_rate = rate;
        }
    }
}



