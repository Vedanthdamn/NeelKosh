// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IVerificationRegistry
/// @notice The gate the credit token calls to confirm an MRV claim was independently approved.
/// @dev Exists as an interface so the token depends on the approval rule rather than on a
///      specific registry deployment; the verification workflow can be replaced without
///      reissuing credits.
interface IVerificationRegistry {
    /// @notice Atomically confirms an approved claim and marks it as issued.
    /// @dev Consuming and checking in one call is what makes double-issuance impossible: a
    ///      read-then-write split would let two mint transactions both observe "approved".
    ///      Reverts unless the claim is approved, unissued, and for exactly this tonnage.
    /// @param projectId Project the claim belongs to.
    /// @param vintage Reporting period the claim covers.
    /// @param tonnes Tonnage being issued, which must equal the approved tonnage.
    /// @return verifier The address that approved the claim.
    /// @return dataHash Hash of the off-chain MRV report the approval was based on.
    function consumeApproval(
        uint256 projectId,
        uint32 vintage,
        uint256 tonnes
    ) external returns (address verifier, bytes32 dataHash);

    /// @notice Reports whether a claim is approved and still awaiting issuance.
    /// @param projectId Project the claim belongs to.
    /// @param vintage Reporting period the claim covers.
    /// @return True when credits may still be minted against this claim.
    function isReadyToMint(uint256 projectId, uint32 vintage) external view returns (bool);
}
