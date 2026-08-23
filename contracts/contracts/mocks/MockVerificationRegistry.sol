// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IVerificationRegistry} from "../interfaces/IVerificationRegistry.sol";

/// @title MockVerificationRegistry
/// @notice Test double that lets CarbonCreditToken be exercised in isolation.
/// @dev TEST ONLY. Not deployed by any script and not part of the demo system. Approvals are
///      set directly instead of going through a submit-and-approve workflow, so the token's
///      own rules can be tested without the real registry's access control in the way. The
///      integration tests use the real VerificationRegistry.
contract MockVerificationRegistry is IVerificationRegistry {
    struct Approval {
        uint256 tonnes;
        address verifier;
        bytes32 dataHash;
        bool approved;
        bool minted;
    }

    mapping(uint256 projectId => mapping(uint32 vintage => Approval)) private _approvals;

    error NotApproved(uint256 projectId, uint32 vintage);
    error AlreadyMinted(uint256 projectId, uint32 vintage);
    error TonnageMismatch(uint256 approved, uint256 requested);

    /// @notice Records an approval directly, bypassing the real submission workflow.
    /// @param projectId Project the claim belongs to.
    /// @param vintage Reporting period the claim covers.
    /// @param tonnes Approved tonnage.
    /// @param verifier Address to report as the approving verifier.
    /// @param dataHash Hash of the notional off-chain MRV report.
    function setApproval(
        uint256 projectId,
        uint32 vintage,
        uint256 tonnes,
        address verifier,
        bytes32 dataHash
    ) external {
        _approvals[projectId][vintage] = Approval({
            tonnes: tonnes,
            verifier: verifier,
            dataHash: dataHash,
            approved: true,
            minted: false
        });
    }

    /// @inheritdoc IVerificationRegistry
    function consumeApproval(
        uint256 projectId,
        uint32 vintage,
        uint256 tonnes
    ) external returns (address verifier, bytes32 dataHash) {
        Approval storage approval = _approvals[projectId][vintage];
        if (!approval.approved) revert NotApproved(projectId, vintage);
        if (approval.minted) revert AlreadyMinted(projectId, vintage);
        if (approval.tonnes != tonnes) revert TonnageMismatch(approval.tonnes, tonnes);

        approval.minted = true;
        return (approval.verifier, approval.dataHash);
    }

    /// @inheritdoc IVerificationRegistry
    function isReadyToMint(uint256 projectId, uint32 vintage) external view returns (bool) {
        Approval storage approval = _approvals[projectId][vintage];
        return approval.approved && !approval.minted;
    }
}
