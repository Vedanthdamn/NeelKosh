// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SimStablecoin
/// @notice A simulated fiat-pegged stablecoin ("NKR") used as the marketplace's payment
///         currency in this demo, standing in for a real payment rail (UPI-backed stablecoin,
///         USDC, etc.) that a production deployment would integrate instead.
/// @dev There is no reserve backing this token and no minting path other than the faucet: it
///      exists purely so a demo buyer wallet can hold and spend a currency without a real
///      payment integration. Not intended to represent real value anywhere outside this demo.
contract SimStablecoin is ERC20 {
    /// @notice Tokens granted per faucet claim, before decimals.
    uint256 public constant FAUCET_AMOUNT = 10_000 * 10 ** 18;

    /// @notice Minimum time an address must wait between faucet claims.
    /// @dev 24h keeps the faucet usable for a demo session without letting one address mint an
    ///      unbounded balance by spamming the call.
    uint256 public constant FAUCET_COOLDOWN = 24 hours;

    /// @notice Timestamp each address last claimed the faucet, 0 if never claimed.
    mapping(address account => uint256) public lastFaucetClaim;

    /// @notice Emitted when an address successfully claims faucet tokens.
    event FaucetClaimed(address indexed account, uint256 amount, uint256 claimedAt);

    /// @notice Thrown when an address claims again before its cooldown has elapsed.
    error FaucetCooldownActive(address account, uint256 availableAt);

    constructor() ERC20("NeelKosh Rupee", "NKR") {}

    /// @notice Mints FAUCET_AMOUNT tokens to the caller, once per address per FAUCET_COOLDOWN.
    /// @dev Mints directly to msg.sender rather than crediting an allowance, so a claim is
    ///      usable immediately without a second transaction. The cooldown is tracked per
    ///      address, not globally, so one busy demo wallet cannot exhaust a shared budget for
    ///      everyone else.
    function claimFaucet() external {
        uint256 lastClaim = lastFaucetClaim[msg.sender];
        uint256 availableAt = lastClaim + FAUCET_COOLDOWN;
        if (lastClaim != 0 && block.timestamp < availableAt) {
            revert FaucetCooldownActive(msg.sender, availableAt);
        }

        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);

        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT, block.timestamp);
    }
}
