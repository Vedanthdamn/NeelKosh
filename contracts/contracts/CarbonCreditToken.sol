// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";
import {IVerificationRegistry} from "./interfaces/IVerificationRegistry.sol";

/// @title CarbonCreditToken
/// @notice Blue carbon credits, where one token unit is one tonne of CO2 equivalent.
/// @dev ERC-1155 rather than ERC-20 because credits are not fungible across batches: a tonne
///      sequestered by one project in 2024 is a different instrument from a tonne sequestered
///      by another project in 2025, and buyers price that difference. Each token id encodes
///      exactly one (project, vintage) pair, so batches stay distinguishable while remaining
///      fungible within a batch, which is what makes them tradeable.
contract CarbonCreditToken is ERC1155, AccessControl {
    /// @notice Role permitted to issue credits.
    /// @dev Held by the backend oracle bridge, which mints only after the off-chain MRV
    ///      pipeline finishes. The role is not a licence to invent credits: every mint is
    ///      still gated on an independent approval recorded in the verification registry.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Role permitted to repoint the metadata URI.
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");

    /// @dev Token ids pack a project id and a vintage year into one word so that any client
    ///      can derive an id locally instead of querying for it, and so an id can be read back
    ///      into its parts by an explorer. The low 32 bits hold the vintage.
    uint256 private constant VINTAGE_BITS = 32;
    uint256 private constant VINTAGE_MASK = (1 << VINTAGE_BITS) - 1;

    /// @notice Provenance of a single issued batch.
    /// @dev Stored, not just emitted, because a buyer inspecting a batch mid-trade needs to
    ///      resolve its origin from contract state without replaying event history.
    struct CreditBatch {
        uint256 projectId;
        uint32 vintage;
        address verifier;
        bytes32 dataHash;
        uint64 issuedAt;
    }

    /// @notice Permanent record of one retirement, kept for certificate lookups.
    /// @dev Retirement is the point where a credit does its job, so the claim needs to survive
    ///      as queryable state rather than only as a log an indexer might miss.
    struct Retirement {
        uint256 tokenId;
        uint256 amount;
        address retiredBy;
        uint64 retiredAt;
        string reason;
    }

    /// @notice Project registry consulted for issuance eligibility and credit recipients.
    IProjectRegistry public immutable projectRegistry;

    /// @notice Verification registry that must have approved a claim before it can be issued.
    IVerificationRegistry public immutable verificationRegistry;

    /// @notice Tonnes ever issued for a token id.
    /// @dev Never decreases, so `totalMinted - totalRetired` is the circulating supply and the
    ///      pair together prove how much of a batch has been permanently claimed.
    mapping(uint256 tokenId => uint256) public totalMinted;

    /// @notice Tonnes permanently retired for a token id.
    mapping(uint256 tokenId => uint256) public totalRetired;

    mapping(uint256 tokenId => CreditBatch) private _batches;
    Retirement[] private _retirements;

    /// @notice Emitted when a verified claim becomes tradeable credits.
    /// @dev Carries dataHash so the on-chain batch can be tied back to the exact off-chain MRV
    ///      report snapshot that justified it.
    event CreditsMinted(
        uint256 indexed tokenId,
        uint256 indexed projectId,
        uint32 indexed vintage,
        address recipient,
        uint256 tonnesCO2,
        address verifier,
        bytes32 dataHash
    );

    /// @notice Permanent proof that credits were consumed against an emissions claim.
    /// @dev The retirementId doubles as the certificate number shown to the retiring party.
    event RetirementRecord(
        uint256 indexed retirementId,
        uint256 indexed tokenId,
        address indexed retiredBy,
        uint256 amount,
        string reason,
        uint64 retiredAt
    );

    error ProjectNotActive(uint256 projectId);
    error VerifierMismatch(address expected, address recorded);
    error ZeroAmount();
    error VintageOutOfRange(uint256 vintage);
    error ProjectIdOutOfRange(uint256 projectId);
    error EmptyRetirementReason();
    error InsufficientCredits(uint256 tokenId, uint256 held, uint256 requested);
    error RetirementDoesNotExist(uint256 retirementId);
    error InvalidRegistryAddress();

    /// @notice Deploys the credit token bound to a project and verification registry.
    /// @dev Both registries are immutable: repointing them after issuance would retroactively
    ///      change what existing credits mean.
    /// @param uri_ ERC-1155 metadata URI template, using the standard `{id}` placeholder.
    /// @param admin Address receiving DEFAULT_ADMIN_ROLE and URI_SETTER_ROLE.
    /// @param projectRegistry_ Registry defining which projects exist and who runs them.
    /// @param verificationRegistry_ Registry that gates issuance on an independent approval.
    constructor(
        string memory uri_,
        address admin,
        address projectRegistry_,
        address verificationRegistry_
    ) ERC1155(uri_) {
        if (admin == address(0) || projectRegistry_ == address(0) || verificationRegistry_ == address(0)) {
            revert InvalidRegistryAddress();
        }
        projectRegistry = IProjectRegistry(projectRegistry_);
        verificationRegistry = IVerificationRegistry(verificationRegistry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(URI_SETTER_ROLE, admin);
    }

    /// @notice Issues credits for a claim that verification has already approved.
    /// @dev Holds the line on two things the MINTER_ROLE holder cannot be trusted to enforce
    ///      alone. First it consumes the approval, which reverts unless an independent verifier
    ///      signed off on exactly this tonnage and no credits were issued against it yet.
    ///      Second it re-checks project status, because a project suspended between approval
    ///      and issuance must not receive credits. Credits go to the implementing organisation
    ///      rather than the caller so a compromised oracle key cannot divert them.
    /// @param projectId Project the credits originate from.
    /// @param vintage Reporting period the credits cover, as a calendar year.
    /// @param tonnesCO2 Tonnes of CO2 equivalent to issue; must match the approved tonnage.
    /// @param verifierAddress Verifier the caller believes approved this claim, cross-checked
    ///        against the registry so an oracle bug surfaces as a revert rather than a bad batch.
    /// @return tokenId The batch identifier the credits were issued under.
    function mintCredits(
        uint256 projectId,
        uint32 vintage,
        uint256 tonnesCO2,
        address verifierAddress
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        if (tonnesCO2 == 0) revert ZeroAmount();
        if (!projectRegistry.isProjectActive(projectId)) revert ProjectNotActive(projectId);

        (address recordedVerifier, bytes32 dataHash) = verificationRegistry.consumeApproval(
            projectId,
            vintage,
            tonnesCO2
        );
        if (recordedVerifier != verifierAddress) {
            revert VerifierMismatch(verifierAddress, recordedVerifier);
        }

        tokenId = encodeTokenId(projectId, vintage);
        address recipient = projectRegistry.getImplementer(projectId);

        totalMinted[tokenId] += tonnesCO2;
        _batches[tokenId] = CreditBatch({
            projectId: projectId,
            vintage: vintage,
            verifier: recordedVerifier,
            dataHash: dataHash,
            issuedAt: uint64(block.timestamp)
        });

        _mint(recipient, tokenId, tonnesCO2, "");

        emit CreditsMinted(tokenId, projectId, vintage, recipient, tonnesCO2, recordedVerifier, dataHash);
    }

    /// @notice Permanently retires credits against a stated emissions claim.
    /// @dev Burns rather than transferring to a dead address: burning is what makes the
    ///      retirement irreversible at the token level, so retired credits cannot be moved,
    ///      resold, or retired a second time. Only the holder can retire their own credits,
    ///      because retirement is an assertion about the caller's emissions that nobody else
    ///      is entitled to make on their behalf.
    /// @param tokenId Batch to retire from.
    /// @param amount Tonnes to retire.
    /// @param retirementReason Why the credits were consumed, kept as the certificate's claim.
    /// @return retirementId Certificate number for the resulting permanent record.
    function retireCredits(
        uint256 tokenId,
        uint256 amount,
        string calldata retirementReason
    ) external returns (uint256 retirementId) {
        if (amount == 0) revert ZeroAmount();
        if (bytes(retirementReason).length == 0) revert EmptyRetirementReason();

        uint256 held = balanceOf(msg.sender, tokenId);
        if (held < amount) revert InsufficientCredits(tokenId, held, amount);

        totalRetired[tokenId] += amount;
        _burn(msg.sender, tokenId, amount);

        retirementId = _retirements.length;
        _retirements.push(
            Retirement({
                tokenId: tokenId,
                amount: amount,
                retiredBy: msg.sender,
                retiredAt: uint64(block.timestamp),
                reason: retirementReason
            })
        );

        emit RetirementRecord(
            retirementId,
            tokenId,
            msg.sender,
            amount,
            retirementReason,
            uint64(block.timestamp)
        );
    }

    /// @notice Derives the token id for a project and vintage.
    /// @dev Pure so any client can compute an id offline; the packing is part of the contract's
    ///      public shape, not an internal detail.
    /// @param projectId Project the batch belongs to.
    /// @param vintage Reporting period, as a calendar year.
    /// @return The packed token id.
    function encodeTokenId(uint256 projectId, uint32 vintage) public pure returns (uint256) {
        if (projectId > type(uint256).max >> VINTAGE_BITS) revert ProjectIdOutOfRange(projectId);
        if (vintage == 0) revert VintageOutOfRange(vintage);
        return (projectId << VINTAGE_BITS) | uint256(vintage);
    }

    /// @notice Splits a token id back into its project and vintage.
    /// @dev Lets explorers and wallets label a batch without an extra contract call.
    /// @param tokenId Packed token id.
    /// @return projectId The originating project.
    /// @return vintage The reporting period.
    function decodeTokenId(uint256 tokenId) public pure returns (uint256 projectId, uint32 vintage) {
        projectId = tokenId >> VINTAGE_BITS;
        vintage = uint32(tokenId & VINTAGE_MASK);
    }

    /// @notice Returns the provenance of an issued batch.
    /// @dev The dataHash it carries is what lets a buyer verify the batch against the archived
    ///      MRV report rather than trusting the registry's word.
    /// @param tokenId Batch to read.
    /// @return The stored batch record; zeroed if nothing was ever issued for this id.
    function getBatch(uint256 tokenId) external view returns (CreditBatch memory) {
        return _batches[tokenId];
    }

    /// @notice Credits still in circulation for a batch.
    /// @dev Derived from the minted and retired totals so the two can never disagree with it.
    /// @param tokenId Batch to read.
    /// @return Tonnes issued and not yet retired.
    function circulatingSupply(uint256 tokenId) external view returns (uint256) {
        return totalMinted[tokenId] - totalRetired[tokenId];
    }

    /// @notice Reads a retirement certificate.
    /// @param retirementId Certificate number returned by retireCredits.
    /// @return The permanent retirement record.
    function getRetirement(uint256 retirementId) external view returns (Retirement memory) {
        if (retirementId >= _retirements.length) revert RetirementDoesNotExist(retirementId);
        return _retirements[retirementId];
    }

    /// @notice Number of retirements recorded across all batches.
    /// @dev Certificate numbers run from 0 to this value minus one.
    /// @return The retirement count.
    function retirementCount() external view returns (uint256) {
        return _retirements.length;
    }

    /// @notice Repoints the metadata URI template for every batch.
    /// @dev Metadata is mutable while the credits themselves are not, so that hosting can move
    ///      without touching issued balances.
    /// @param newUri New URI template using the `{id}` placeholder.
    function setURI(string calldata newUri) external onlyRole(URI_SETTER_ROLE) {
        _setURI(newUri);
    }

    /// @notice Standard ERC-165 support check.
    /// @dev Resolves the ERC1155 and AccessControl implementations, which both define it.
    /// @param interfaceId Interface identifier being queried.
    /// @return True when the interface is supported.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
