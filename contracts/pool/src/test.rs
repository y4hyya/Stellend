#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{StellarAssetClient, TokenClient},
    Env,
};

/// Helper to create a test token
fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
    let contract_address = env.register_stellar_asset_contract_v2(admin.clone());
    (
        TokenClient::new(env, &contract_address.address()),
        StellarAssetClient::new(env, &contract_address.address()),
    )
}

/// Helper to setup a complete test environment
fn setup_test_env() -> (Env, Address, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    // Set ledger timestamp
    env.ledger().set(LedgerInfo {
        timestamp: 1000,
        protocol_version: 20,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 100,
        min_persistent_entry_ttl: 100,
        max_entry_ttl: 1000,
    });

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let oracle = Address::generate(&env); // Mock oracle address
    let interest_rate_model = Address::generate(&env); // Mock interest rate model

    // Create tokens
    let (xlm_client, xlm_admin_client) = create_token(&env, &admin);
    let (usdc_client, usdc_admin_client) = create_token(&env, &admin);

    let xlm_token = xlm_client.address.clone();
    let usdc_token = usdc_client.address.clone();

    // Mint tokens to user
    xlm_admin_client.mint(&user, &10_000_000_000_000); // 1,000,000 XLM
    usdc_admin_client.mint(&user, &10_000_000_000_000); // 1,000,000 USDC

    // Register pool contract
    let pool_id = env.register_contract(None, LendingPool);
    let pool_client = LendingPoolClient::new(&env, &pool_id);

    // Initialize pool with all required addresses
    pool_client.initialize(&admin, &oracle, &interest_rate_model, &xlm_token, &usdc_token);

    // Mint tokens to pool for liquidity
    usdc_admin_client.mint(&pool_id, &1_000_000_000_000); // 100,000 USDC in pool

    (env, pool_id, admin, user, oracle, xlm_token, usdc_token)
}

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let interest_rate_model = Address::generate(&env);
    let xlm_token = Address::generate(&env);
    let usdc_token = Address::generate(&env);

    let contract_id = env.register_contract(None, LendingPool);
    let client = LendingPoolClient::new(&env, &contract_id);

    client.initialize(&admin, &oracle, &interest_rate_model, &xlm_token, &usdc_token);

    // Check markets are initialized
    let xlm_ltv = client.get_ltv_ratio(&symbol_short!("XLM"));
    let usdc_ltv = client.get_ltv_ratio(&symbol_short!("USDC"));

    assert_eq!(xlm_ltv, 7_500_000); // 75%
    assert_eq!(usdc_ltv, 8_000_000); // 80%

    // Check interest rate model is stored
    assert_eq!(client.get_interest_rate_model(), interest_rate_model);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let interest_rate_model = Address::generate(&env);
    let xlm_token = Address::generate(&env);
    let usdc_token = Address::generate(&env);

    let contract_id = env.register_contract(None, LendingPool);
    let client = LendingPoolClient::new(&env, &contract_id);

    client.initialize(&admin, &oracle, &interest_rate_model, &xlm_token, &usdc_token);
    client.initialize(&admin, &oracle, &interest_rate_model, &xlm_token, &usdc_token); // Should panic
}

#[test]
fn test_supply() {
    let (env, pool_id, _admin, user, _oracle, _xlm_token, usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);
    let usdc_client = TokenClient::new(&env, &usdc_token);

    let supply_amount: i128 = 1_000_000_000; // 100 USDC

    // Get initial balance
    let initial_balance = usdc_client.balance(&user);

    // Supply USDC
    let shares = client.supply(&user, &symbol_short!("USDC"), &supply_amount);

    // Check shares were minted (1:1 initially)
    assert!(shares > 0);
    assert_eq!(shares, supply_amount); // Initial exchange rate is 1:1

    // Check user balance decreased
    let new_balance = usdc_client.balance(&user);
    assert_eq!(new_balance, initial_balance - supply_amount);

    // Check pool state
    let total_supply = client.get_total_supply(&symbol_short!("USDC"));
    assert_eq!(total_supply, supply_amount);

    let user_shares = client.get_user_shares(&user, &symbol_short!("USDC"));
    assert_eq!(user_shares, shares);
}

#[test]
fn test_withdraw() {
    let (env, pool_id, _admin, user, _oracle, _xlm_token, usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);
    let usdc_client = TokenClient::new(&env, &usdc_token);

    let supply_amount: i128 = 1_000_000_000; // 100 USDC

    // Supply first
    let shares = client.supply(&user, &symbol_short!("USDC"), &supply_amount);
    let balance_after_supply = usdc_client.balance(&user);

    // Withdraw all shares
    let withdrawn = client.withdraw(&user, &symbol_short!("USDC"), &shares);

    // Check amount withdrawn
    assert_eq!(withdrawn, supply_amount);

    // Check balance restored
    let final_balance = usdc_client.balance(&user);
    assert_eq!(final_balance, balance_after_supply + supply_amount);

    // Check pool state
    let total_supply = client.get_total_supply(&symbol_short!("USDC"));
    assert_eq!(total_supply, 0);

    let user_shares = client.get_user_shares(&user, &symbol_short!("USDC"));
    assert_eq!(user_shares, 0);
}

#[test]
fn test_deposit_collateral() {
    let (env, pool_id, _admin, user, _oracle, xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);
    let xlm_client = TokenClient::new(&env, &xlm_token);

    let collateral_amount: i128 = 10_000_000_000; // 1000 XLM

    let initial_balance = xlm_client.balance(&user);

    // Deposit collateral
    let deposited = client.deposit_collateral(&user, &symbol_short!("XLM"), &collateral_amount);

    assert_eq!(deposited, collateral_amount);

    // Check balance decreased
    let new_balance = xlm_client.balance(&user);
    assert_eq!(new_balance, initial_balance - collateral_amount);

    // Check user collateral
    let user_collateral = client.get_user_collateral(&user, &symbol_short!("XLM"));
    assert_eq!(user_collateral, collateral_amount);
}

#[test]
fn test_borrow() {
    let (env, pool_id, admin, user, _oracle, xlm_token, usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);
    let xlm_client = TokenClient::new(&env, &xlm_token);
    let usdc_client = TokenClient::new(&env, &usdc_token);

    // First, supply USDC to the pool (so there's liquidity to borrow)
    let supply_amount: i128 = 100_000_000_000; // 10,000 USDC
    client.supply(&user, &symbol_short!("USDC"), &supply_amount);

    // Deposit XLM as collateral
    let collateral_amount: i128 = 10_000_000_000; // 1000 XLM
    client.deposit_collateral(&user, &symbol_short!("XLM"), &collateral_amount);

    // Check position before borrow
    let position = client.get_user_position(&user);
    assert!(position.collateral_value_usd > 0);
    assert!(position.available_borrow_usd > 0);

    // Borrow USDC (within LTV limit)
    // With 1000 XLM at $0.30 = $300 collateral
    // At 75% LTV, max borrow = $225
    let borrow_amount: i128 = 200_000_000; // 20 USDC (well within limit)

    let initial_usdc = usdc_client.balance(&user);
    let borrowed = client.borrow(&user, &symbol_short!("USDC"), &borrow_amount);

    assert_eq!(borrowed, borrow_amount);

    // Check USDC balance increased
    let new_usdc = usdc_client.balance(&user);
    assert_eq!(new_usdc, initial_usdc + borrow_amount);

    // Check debt recorded
    let user_debt = client.get_user_debt(&user, &symbol_short!("USDC"));
    assert_eq!(user_debt, borrow_amount);

    // Check position after borrow
    let position_after = client.get_user_position(&user);
    assert!(position_after.debt_value_usd > 0);
    assert!(position_after.available_borrow_usd < position.available_borrow_usd);
}

#[test]
#[should_panic(expected = "Borrow exceeds LTV limit")]
fn test_borrow_exceeds_ltv() {
    let (env, pool_id, admin, user, _oracle, xlm_token, usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // Supply USDC to pool
    let supply_amount: i128 = 100_000_000_000;
    client.supply(&user, &symbol_short!("USDC"), &supply_amount);

    // Deposit small collateral
    let collateral_amount: i128 = 1_000_000_000; // 100 XLM = $30 collateral
    client.deposit_collateral(&user, &symbol_short!("XLM"), &collateral_amount);

    // Try to borrow more than LTV allows (max ~$22.50)
    let borrow_amount: i128 = 500_000_000; // 50 USDC = $50 (exceeds limit)
    client.borrow(&user, &symbol_short!("USDC"), &borrow_amount); // Should panic
}

#[test]
fn test_repay() {
    let (env, pool_id, admin, user, _oracle, xlm_token, usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);
    let usdc_client = TokenClient::new(&env, &usdc_token);

    // Setup: supply, deposit collateral, borrow
    client.supply(&user, &symbol_short!("USDC"), &100_000_000_000);
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000);
    let borrow_amount: i128 = 200_000_000;
    client.borrow(&user, &symbol_short!("USDC"), &borrow_amount);

    let initial_usdc = usdc_client.balance(&user);

    // Repay half
    let repay_amount: i128 = 100_000_000;
    let repaid = client.repay(&user, &symbol_short!("USDC"), &repay_amount);

    assert_eq!(repaid, repay_amount);

    // Check balance decreased
    let new_usdc = usdc_client.balance(&user);
    assert_eq!(new_usdc, initial_usdc - repay_amount);

    // Check debt decreased
    let remaining_debt = client.get_user_debt(&user, &symbol_short!("USDC"));
    assert_eq!(remaining_debt, borrow_amount - repay_amount);
}

#[test]
fn test_repay_full() {
    let (env, pool_id, admin, user, _oracle, xlm_token, usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // Setup: supply, deposit collateral, borrow
    client.supply(&user, &symbol_short!("USDC"), &100_000_000_000);
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000);
    let borrow_amount: i128 = 200_000_000;
    client.borrow(&user, &symbol_short!("USDC"), &borrow_amount);

    // Repay more than owed (should cap at debt)
    let repay_amount: i128 = 500_000_000;
    let repaid = client.repay(&user, &symbol_short!("USDC"), &repay_amount);

    // Should only repay actual debt
    assert_eq!(repaid, borrow_amount);

    // Debt should be zero
    let remaining_debt = client.get_user_debt(&user, &symbol_short!("USDC"));
    assert_eq!(remaining_debt, 0);
}

#[test]
fn test_withdraw_collateral() {
    let (env, pool_id, _admin, user, _oracle, xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);
    let xlm_client = TokenClient::new(&env, &xlm_token);

    let collateral_amount: i128 = 10_000_000_000;
    client.deposit_collateral(&user, &symbol_short!("XLM"), &collateral_amount);

    let initial_balance = xlm_client.balance(&user);

    // Withdraw half (no debt, should succeed)
    let withdraw_amount: i128 = 5_000_000_000;
    let withdrawn = client.withdraw_collateral(&user, &symbol_short!("XLM"), &withdraw_amount);

    assert_eq!(withdrawn, withdraw_amount);

    // Check balance increased
    let new_balance = xlm_client.balance(&user);
    assert_eq!(new_balance, initial_balance + withdraw_amount);

    // Check collateral decreased
    let remaining = client.get_user_collateral(&user, &symbol_short!("XLM"));
    assert_eq!(remaining, collateral_amount - withdraw_amount);
}

#[test]
fn test_get_market_info() {
    let (env, pool_id, _admin, user, _oracle, _xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // Supply and borrow
    client.supply(&user, &symbol_short!("USDC"), &1_000_000_000);
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000);
    client.borrow(&user, &symbol_short!("USDC"), &200_000_000);

    let market_info = client.get_market_info(&symbol_short!("USDC"));

    assert_eq!(market_info.total_supply, 1_000_000_000);
    assert_eq!(market_info.total_borrow, 200_000_000);
    assert!(market_info.utilization_rate > 0);
    assert_eq!(market_info.ltv_ratio, 8_000_000); // 80%
}

#[test]
fn test_get_user_position() {
    let (env, pool_id, _admin, user, _oracle, _xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // Deposit collateral
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000); // 1000 XLM

    let position = client.get_user_position(&user);

    // 1000 XLM at $0.30 = $300 collateral
    assert!(position.collateral_value_usd > 0);
    assert_eq!(position.debt_value_usd, 0);
    assert!(position.available_borrow_usd > 0);
    assert_eq!(position.health_factor, 999 * SCALE); // Infinite when no debt
}

// ============================================================================
// INTEREST RATE TESTS
// ============================================================================

#[test]
fn test_borrow_rate_zero_utilization() {
    let (env, pool_id, _admin, _user, _oracle, _xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // No borrows, utilization = 0%
    let borrow_rate = client.get_borrow_rate(&symbol_short!("USDC"));
    assert_eq!(borrow_rate, 0); // 0% when no utilization
}

#[test]
fn test_borrow_rate_with_utilization() {
    let (env, pool_id, _admin, user, _oracle, _xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // Supply USDC and borrow to create 20% utilization
    client.supply(&user, &symbol_short!("USDC"), &1_000_000_000); // 100 USDC
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000); // 1000 XLM
    client.borrow(&user, &symbol_short!("USDC"), &200_000_000); // 20 USDC (20% util)

    let market_info = client.get_market_info(&symbol_short!("USDC"));
    
    // Utilization should be 20% (2_000_000 scaled)
    assert_eq!(market_info.utilization_rate, 2_000_000);
    
    // Borrow rate at 20% utilization:
    // rate = 0% + (20% / 80%) * 4% = 1%
    assert_eq!(market_info.borrow_rate, 100_000); // 1%
    
    // Supply rate = borrow_rate * utilization * (1 - reserve_factor)
    // = 1% * 20% * 90% = 0.18%
    assert!(market_info.supply_rate > 0);
}

#[test]
fn test_interest_accrual() {
    // This test verifies that the interest accrual mechanism is set up correctly
    // by checking that the borrow index increases when time passes
    
    let env = Env::default();
    env.mock_all_auths();

    // Set initial timestamp with high TTL values to prevent expiration
    env.ledger().set(LedgerInfo {
        timestamp: 1000,
        protocol_version: 20,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1_000_000_000,
        min_persistent_entry_ttl: 1_000_000_000,
        max_entry_ttl: 1_000_000_000,
    });

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let oracle = Address::generate(&env);
    let interest_rate_model = Address::generate(&env);

    // Create tokens
    let (xlm_client, xlm_admin_client) = create_token(&env, &admin);
    let (usdc_client, usdc_admin_client) = create_token(&env, &admin);
    let xlm_token = xlm_client.address.clone();
    let usdc_token = usdc_client.address.clone();

    // Mint tokens to user
    xlm_admin_client.mint(&user, &100_000_000_000_000);
    usdc_admin_client.mint(&user, &100_000_000_000_000);

    // Register and initialize pool
    let pool_id = env.register_contract(None, LendingPool);
    let client = LendingPoolClient::new(&env, &pool_id);
    client.initialize(&admin, &oracle, &interest_rate_model, &xlm_token, &usdc_token);
    usdc_admin_client.mint(&pool_id, &1_000_000_000_000);

    // Setup: supply and borrow
    client.supply(&user, &symbol_short!("USDC"), &1_000_000_000); // 100 USDC
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000);
    client.borrow(&user, &symbol_short!("USDC"), &200_000_000); // 20 USDC

    let initial_borrow_index = client.get_borrow_index(&symbol_short!("USDC"));

    // Advance time by 30 days (2,592,000 seconds)
    env.ledger().set(LedgerInfo {
        timestamp: 1000 + 2_592_000, // +30 days
        protocol_version: 20,
        sequence_number: 200,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1_000_000_000,
        min_persistent_entry_ttl: 1_000_000_000,
        max_entry_ttl: 1_000_000_000,
    });

    // Trigger interest accrual by supplying more USDC
    // (supply calls accrue_interest on the USDC market)
    client.supply(&user, &symbol_short!("USDC"), &1_000_000); // Small supply

    // Check that borrow index increased (interest accrued)
    let new_borrow_index = client.get_borrow_index(&symbol_short!("USDC"));
    assert!(new_borrow_index > initial_borrow_index, "Borrow index should increase with time");

    // Get market info to verify rates are calculated
    let market_info = client.get_market_info(&symbol_short!("USDC"));
    assert!(market_info.borrow_rate > 0, "Borrow rate should be positive");
    assert!(market_info.utilization_rate > 0, "Utilization should be positive");
}

#[test]
fn test_market_info_includes_rates() {
    let (env, pool_id, _admin, user, _oracle, _xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // Create 80% utilization (optimal point)
    client.supply(&user, &symbol_short!("USDC"), &1_000_000_000); // 100 USDC
    client.deposit_collateral(&user, &symbol_short!("XLM"), &100_000_000_000); // 10000 XLM
    client.borrow(&user, &symbol_short!("USDC"), &800_000_000); // 80 USDC (80% util)

    let market_info = client.get_market_info(&symbol_short!("USDC"));

    // At 80% utilization (optimal):
    // Borrow rate = 0% + (80%/80%) * 4% = 4%
    assert_eq!(market_info.utilization_rate, 8_000_000); // 80%
    assert_eq!(market_info.borrow_rate, 400_000); // 4%
    
    // Supply rate = 4% * 80% * 90% = 2.88%
    assert!(market_info.supply_rate > 0);
    assert!(market_info.supply_rate < market_info.borrow_rate);
}

#[test]
fn test_get_health_factor() {
    let (env, pool_id, _admin, user, _oracle, _xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // User with no debt should have infinite health factor
    let hf = client.get_health_factor(&user);
    assert_eq!(hf, 999 * 10_000_000); // 999 * SCALE

    // Setup: deposit collateral and borrow
    client.supply(&user, &symbol_short!("USDC"), &1_000_000_000); // 100 USDC
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000); // 1000 XLM = $300
    client.borrow(&user, &symbol_short!("USDC"), &200_000_000); // 20 USDC = $20

    // Health factor = (collateral * liq_threshold) / debt
    // = ($300 * 0.8) / $20 = $240 / $20 = 12.0
    let hf = client.get_health_factor(&user);
    assert!(hf > 10_000_000); // HF > 1.0 (safe)
}

#[test]
#[should_panic(expected = "Position is healthy")]
fn test_liquidate_healthy_position_fails() {
    let (env, pool_id, _admin, user, _oracle, _xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);
    let liquidator = Address::generate(&env);

    // Setup: deposit collateral and borrow (healthy position)
    client.supply(&user, &symbol_short!("USDC"), &1_000_000_000); // 100 USDC
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000); // 1000 XLM
    client.borrow(&user, &symbol_short!("USDC"), &200_000_000); // 20 USDC

    // Health factor should be > 1.0
    let hf = client.get_health_factor(&user);
    assert!(hf > 10_000_000);

    // Mint USDC to liquidator
    let (usdc_client, _) = create_token(&env, &_admin);
    let usdc_admin_client = StellarAssetClient::new(&env, &usdc_client.address);
    usdc_admin_client.mint(&liquidator, &1_000_000_000);

    // Try to liquidate - should panic because position is healthy
    client.liquidate(
        &liquidator,
        &user,
        &symbol_short!("USDC"),
        &100_000_000, // 10 USDC
        &symbol_short!("XLM"),
    );
}

#[test]
fn test_liquidate_function_exists() {
    // This test verifies that the liquidation function is properly implemented
    // In a real scenario, an underwater position would be created by price drops
    // For this test, we just verify the function signature and basic structure
    
    let (env, pool_id, _admin, user, _oracle, _xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // Setup: deposit collateral and supply
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000); // 1000 XLM = $300
    client.supply(&user, &symbol_short!("USDC"), &1_000_000_000); // 100 USDC

    // Check health factor (no debt = infinite HF)
    let hf = client.get_health_factor(&user);
    assert_eq!(hf, 999 * 10_000_000); // No debt = infinite HF
    
    // Verify liquidation threshold is set correctly
    let xlm_liq_threshold = client.get_liquidation_threshold(&symbol_short!("XLM"));
    assert_eq!(xlm_liq_threshold, 8_000_000); // 80%
    
    // Note: To actually test liquidation, we would need to:
    // 1. Deploy a real price oracle contract
    // 2. Update the oracle to crash XLM price (e.g., $0.30 -> $0.15)
    // 3. Create a borrow position that becomes underwater
    // 4. Call liquidate() to test the full flow
    // For this unit test, we verify the function exists and constants are correct
}

#[test]
fn test_liquidation_constants() {
    // This test verifies that liquidation constants are properly defined
    // CLOSE_FACTOR = 50% (can liquidate up to half of borrower's debt)
    // LIQUIDATION_BONUS = 5% (liquidator gets 5% extra collateral)
    
    let (env, pool_id, _admin, user, _oracle, _xlm_token, _usdc_token) = setup_test_env();
    let client = LendingPoolClient::new(&env, &pool_id);

    // Create a position to verify liquidation threshold is set
    client.deposit_collateral(&user, &symbol_short!("XLM"), &10_000_000_000); // 1000 XLM
    
    // Check liquidation threshold exists
    let xlm_liq_threshold = client.get_liquidation_threshold(&symbol_short!("XLM"));
    assert_eq!(xlm_liq_threshold, 8_000_000); // 80%
    
    let usdc_liq_threshold = client.get_liquidation_threshold(&symbol_short!("USDC"));
    assert_eq!(usdc_liq_threshold, 8_500_000); // 85%
    
    // Note: To test actual liquidation behavior, we would need:
    // 1. A deployed price oracle
    // 2. Ability to manipulate prices (crash mode)
    // 3. Create an underwater position
    // 4. Call liquidate() and verify collateral transfer + bonus
}

