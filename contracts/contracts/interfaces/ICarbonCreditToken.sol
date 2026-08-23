// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/// @title ICarbonCreditToken
/// @notice The slice of CarbonCreditToken that Marketplace depends on.
/// @dev Extends the standard ERC-1155 surface (balances, transfers, approvals) with just the
///      one custom accessor Marketplace needs to recover which project a listed batch belongs
///      to. Kept narrow for the same reason as IProjectRegistry: Marketplace should not need a
///      redeploy every time CarbonCreditToken grows an unrelated feature.
interface ICarbonCreditToken is IERC1155 {
    /// @notice Splits a token id back into its project and vintage.
    /// @param tokenId Packed token id.
    /// @return projectId The originating project.
    /// @return vintage The reporting period.
    function decodeTokenId(uint256 tokenId) external pure returns (uint256 projectId, uint32 vintage);
}
