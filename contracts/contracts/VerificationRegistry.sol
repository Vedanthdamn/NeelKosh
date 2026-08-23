// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";
import {IVerificationRegistry} from "./interfaces/IVerificationRegistry.sol";

/// @title VerificationRegistry
/// @notice The audit trail that stands between an MRV claim and the credits issued for it.
/// @dev Splits claiming from approving so that no single party can turn field data into
///      tradeable credits. A project states what it sequestered and pins the evidence with a
///      hash; an independent verifier signs off; only then can the token contract issue. The
///      hash is the load-bearing part: it fixes the on-chain record to one immutable off-chain
///      report, so a report edited after approval no longer matches what was approved.
contract VerificationRegistry is IVerificationRegistry, AccessControl {
    /// @notice Role permitted to approve or reject submissions.
    /// @dev Held by accredited third-party verifiers, deliberately separate from the registrar
    ///      role that onboards projects, so onboarding and sign-off cannot collude in one key.
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    /// @notice Role permitted to consume an approval and thereby issue credits.
    /// @dev Granted to the CarbonCreditToken contract and to nothing else. Without this gate,
    ///      any caller could burn through approvals and leave real issuance unable to proceed.
    bytes32 public constant CREDIT_ISSUER_ROLE = keccak256("CREDIT_ISSUER_ROLE");

    /// @notice Lifecycle of a single MRV claim.
    /// @dev Issued is terminal and distinct from Approved so that the record still shows an
    ///      approval happened after the credits have been drawn against it.
    enum SubmissionStatus {
        None,
        Pending,
        Approved,
        Rejected,
        Issued
    }

    /// @notice One MRV claim and its verification outcome.
    struct Submission {
        uint256 id;
        uint256 projectId;
        uint32 vintage;
        uint256 claimedTonnes;
        bytes32 dataHash;
        address submitter;
        address verifier;
        SubmissionStatus status;
        uint64 submittedAt;
        uint64 decidedAt;
    }

    /// @notice Project registry consulted for submission rights and project standing.
    IProjectRegistry public immutable projectRegistry;

    uint256 private _nextSubmissionId = 1;

    mapping(uint256 submissionId => Submission) private _submissions;

    /// @dev The one submission that currently occupies a (project, vintage) slot. Non-zero
    ///      while Pending, Approved or Issued; reset to zero on rejection so a corrected claim
    ///      can be filed. Holding the slot through Issued is what stops a project from filing a
    ///      second claim for a period it has already been paid for.
    mapping(uint256 projectId => mapping(uint32 vintage => uint256)) private _activeSubmission;

    /// @notice Emitted when a project files an MRV claim for review.
    event VerificationSubmitted(
        uint256 indexed submissionId,
        uint256 indexed projectId,
        uint32 indexed vintage,
        address submitter,
        uint256 claimedTonnes,
        bytes32 dataHash,
        uint64 submittedAt
    );

    /// @notice Emitted when a verifier signs off on a claim.
    /// @dev The verifier address is the accountable party for the credits that follow.
    event VerificationApproved(
        uint256 indexed submissionId,
        uint256 indexed projectId,
        uint32 indexed vintage,
        address verifier,
        uint256 claimedTonnes,
        bytes32 dataHash,
        uint64 approvedAt
    );

    /// @notice Emitted when a verifier turns a claim down.
    /// @dev Rejections stay on the record rather than being deleted, so a project that resubmits
    ///      until it finds a lenient verifier leaves a visible trail.
    event VerificationRejected(
        uint256 indexed submissionId,
        uint256 indexed projectId,
        uint32 indexed vintage,
        address verifier,
        string reason,
        uint64 rejectedAt
    );

    /// @notice Emitted when credits are drawn against an approval.
    event ApprovalConsumed(
        uint256 indexed submissionId,
        uint256 indexed projectId,
        uint32 indexed vintage,
        uint256 tonnes,
        address consumedBy
    );

    error InvalidProjectRegistry();
    error NotProjectImplementer(address caller, address implementer);
    error ProjectNotActive(uint256 projectId);
    error SubmissionAlreadyOpen(uint256 submissionId, SubmissionStatus status);
    error CreditsAlreadyIssued(uint256 submissionId);
    error SubmissionDoesNotExist(uint256 submissionId);
    error SubmissionNotPending(uint256 submissionId, SubmissionStatus status);
    error VerifierCannotBeSubmitter(address account);
    error EmptyDataHash();
    error ZeroTonnes();
    error InvalidVintage(uint32 vintage);
    error EmptyRejectionReason();
    error NoApprovedSubmission(uint256 projectId, uint32 vintage);
    error TonnageMismatch(uint256 approved, uint256 requested);

    /// @notice Deploys the verification registry bound to a project registry.
    /// @dev The project registry is immutable because submission rights are derived from it;
    ///      swapping it later would silently rewrite who may claim credits for which site.
    /// @param admin Address receiving DEFAULT_ADMIN_ROLE, which grants the verifier and issuer roles.
    /// @param projectRegistry_ Registry defining which projects exist and who runs them.
    constructor(address admin, address projectRegistry_) {
        if (admin == address(0) || projectRegistry_ == address(0)) revert InvalidProjectRegistry();
        projectRegistry = IProjectRegistry(projectRegistry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Files an MRV claim for a project and reporting period.
    /// @dev Restricted to the project's implementing organisation, since a claim is an assertion
    ///      about their own field data. One slot per (project, vintage) is enforced here: without
    ///      it a project could file overlapping claims for the same period and have each approved
    ///      by a different verifier, which is double-counting dressed up as two submissions.
    /// @param projectId Project the claim covers.
    /// @param vintage Reporting period, as a calendar year.
    /// @param claimedTonnes Tonnes of CO2 equivalent the project claims to have sequestered.
    /// @param dataHash Hash of the off-chain MRV report backing the claim; this is what ties the
    ///        on-chain record to one specific, immutable evidence snapshot.
    /// @return submissionId Identifier used to approve, reject or audit this claim.
    function submitForVerification(
        uint256 projectId,
        uint32 vintage,
        uint256 claimedTonnes,
        bytes32 dataHash
    ) external returns (uint256 submissionId) {
        if (vintage == 0) revert InvalidVintage(vintage);
        if (claimedTonnes == 0) revert ZeroTonnes();
        if (dataHash == bytes32(0)) revert EmptyDataHash();
        if (!projectRegistry.isProjectActive(projectId)) revert ProjectNotActive(projectId);

        address implementer = projectRegistry.getImplementer(projectId);
        if (msg.sender != implementer) revert NotProjectImplementer(msg.sender, implementer);

        uint256 openId = _activeSubmission[projectId][vintage];
        if (openId != 0) {
            SubmissionStatus openStatus = _submissions[openId].status;
            if (openStatus == SubmissionStatus.Issued) revert CreditsAlreadyIssued(openId);
            revert SubmissionAlreadyOpen(openId, openStatus);
        }

        submissionId = _nextSubmissionId++;

        _submissions[submissionId] = Submission({
            id: submissionId,
            projectId: projectId,
            vintage: vintage,
            claimedTonnes: claimedTonnes,
            dataHash: dataHash,
            submitter: msg.sender,
            verifier: address(0),
            status: SubmissionStatus.Pending,
            submittedAt: uint64(block.timestamp),
            decidedAt: 0
        });
        _activeSubmission[projectId][vintage] = submissionId;

        emit VerificationSubmitted(
            submissionId,
            projectId,
            vintage,
            msg.sender,
            claimedTonnes,
            dataHash,
            uint64(block.timestamp)
        );
    }

    /// @notice Signs off on a pending claim, unlocking issuance for it.
    /// @dev Records which verifier approved, because the credits that follow inherit that
    ///      verifier's reputation and an auditor needs to know whose judgement to question.
    ///      A verifier may not approve a claim they filed themselves even if they somehow hold
    ///      both roles, which keeps the two-party check meaningful rather than nominal.
    /// @param submissionId Claim to approve.
    function approveVerification(uint256 submissionId) external onlyRole(VERIFIER_ROLE) {
        Submission storage submission = _requireSubmission(submissionId);
        if (submission.status != SubmissionStatus.Pending) {
            revert SubmissionNotPending(submissionId, submission.status);
        }
        if (msg.sender == submission.submitter) revert VerifierCannotBeSubmitter(msg.sender);

        submission.status = SubmissionStatus.Approved;
        submission.verifier = msg.sender;
        submission.decidedAt = uint64(block.timestamp);

        emit VerificationApproved(
            submissionId,
            submission.projectId,
            submission.vintage,
            msg.sender,
            submission.claimedTonnes,
            submission.dataHash,
            uint64(block.timestamp)
        );
    }

    /// @notice Turns down a pending claim and frees the period for a corrected resubmission.
    /// @dev The rejected record is kept and only the slot is released, so the history of failed
    ///      claims for a period stays auditable instead of disappearing on resubmission.
    /// @param submissionId Claim to reject.
    /// @param reason Why the claim failed review, recorded for the project and for auditors.
    function rejectVerification(uint256 submissionId, string calldata reason)
        external
        onlyRole(VERIFIER_ROLE)
    {
        Submission storage submission = _requireSubmission(submissionId);
        if (submission.status != SubmissionStatus.Pending) {
            revert SubmissionNotPending(submissionId, submission.status);
        }
        if (bytes(reason).length == 0) revert EmptyRejectionReason();

        submission.status = SubmissionStatus.Rejected;
        submission.verifier = msg.sender;
        submission.decidedAt = uint64(block.timestamp);
        _activeSubmission[submission.projectId][submission.vintage] = 0;

        emit VerificationRejected(
            submissionId,
            submission.projectId,
            submission.vintage,
            msg.sender,
            reason,
            uint64(block.timestamp)
        );
    }

    /// @inheritdoc IVerificationRegistry
    /// @dev Restricted to CREDIT_ISSUER_ROLE, held by the token contract alone. The status flip
    ///      to Issued happens before the caller can act on the return value, so two mints racing
    ///      for the same approval cannot both succeed. Requiring an exact tonnage match rather
    ///      than a ceiling means the issued supply always equals what a verifier actually signed.
    function consumeApproval(
        uint256 projectId,
        uint32 vintage,
        uint256 tonnes
    ) external onlyRole(CREDIT_ISSUER_ROLE) returns (address verifier, bytes32 dataHash) {
        uint256 submissionId = _activeSubmission[projectId][vintage];
        if (submissionId == 0) revert NoApprovedSubmission(projectId, vintage);

        Submission storage submission = _submissions[submissionId];
        if (submission.status != SubmissionStatus.Approved) {
            if (submission.status == SubmissionStatus.Issued) revert CreditsAlreadyIssued(submissionId);
            revert NoApprovedSubmission(projectId, vintage);
        }
        if (submission.claimedTonnes != tonnes) {
            revert TonnageMismatch(submission.claimedTonnes, tonnes);
        }

        submission.status = SubmissionStatus.Issued;

        emit ApprovalConsumed(submissionId, projectId, vintage, tonnes, msg.sender);

        return (submission.verifier, submission.dataHash);
    }

    /// @inheritdoc IVerificationRegistry
    function isReadyToMint(uint256 projectId, uint32 vintage) external view returns (bool) {
        uint256 submissionId = _activeSubmission[projectId][vintage];
        return submissionId != 0 && _submissions[submissionId].status == SubmissionStatus.Approved;
    }

    /// @notice Reads a submission and its verification outcome.
    /// @dev Reverts on unknown ids so a caller cannot mistake a zeroed struct for a real claim.
    /// @param submissionId Claim to read.
    /// @return The stored submission record.
    function getSubmission(uint256 submissionId) external view returns (Submission memory) {
        return _requireSubmission(submissionId);
    }

    /// @notice Returns the submission currently holding a project's reporting period.
    /// @dev Lets the dashboard show what is blocking a period without scanning event history.
    /// @param projectId Project to look up.
    /// @param vintage Reporting period to look up.
    /// @return The occupying submission id, or zero when the period is free to claim.
    function getActiveSubmission(uint256 projectId, uint32 vintage) external view returns (uint256) {
        return _activeSubmission[projectId][vintage];
    }

    /// @notice Total number of claims ever filed.
    /// @dev Ids are sequential from 1, so this doubles as the upper bound for enumeration.
    /// @return The submission count.
    function totalSubmissions() external view returns (uint256) {
        return _nextSubmissionId - 1;
    }

    /// @dev Loads a submission or reverts, so every accessor fails loudly on an unknown id.
    function _requireSubmission(uint256 submissionId)
        private
        view
        returns (Submission storage submission)
    {
        submission = _submissions[submissionId];
        if (submission.id == 0) revert SubmissionDoesNotExist(submissionId);
    }
}
