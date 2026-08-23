// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ProjectRegistry
/// @notice Canonical on-chain list of blue carbon restoration sites in the NeelKosh registry.
/// @dev Everything downstream (verification submissions, credit issuance) keys off a projectId
///      minted here, so this contract is the single source of truth for "does this site exist,
///      who runs it, and is it currently allowed to generate credits".
contract ProjectRegistry is AccessControl {
    /// @notice Role permitted to onboard new projects and change their status.
    /// @dev Held by NCCR-equivalent registry staff, not by the implementing organisations
    ///      themselves, so a project cannot self-onboard or un-suspend itself.
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    /// @notice The blue carbon habitat being restored.
    /// @dev Drives which MRV methodology the off-chain pipeline applies, so it is fixed at
    ///      registration rather than editable later.
    enum Ecosystem {
        Mangrove,
        Seagrass,
        Saltmarsh
    }

    /// @notice Whether a project may currently progress through verification and issuance.
    enum Status {
        Active,
        Suspended
    }

    /// @notice A single vertex of a project's site boundary.
    /// @dev Solidity has no floating point, so degrees are stored as signed microdegrees
    ///      (degrees * 1e6). That gives ~11cm resolution, far finer than the satellite
    ///      imagery the MRV pipeline uses, and keeps a full lat/lng pair inside two int32s.
    struct GeoPoint {
        int32 latitudeE6;
        int32 longitudeE6;
    }

    /// @notice Immutable identity of a registered restoration site.
    /// @dev The boundary polygon lives in a separate mapping because Solidity cannot return
    ///      a struct containing a dynamic array from an auto-generated getter.
    struct Project {
        uint256 id;
        string name;
        Ecosystem ecosystem;
        address implementer;
        uint64 registeredAt;
        Status status;
    }

    /// @dev Minimum vertices that can enclose an area. Anything less is a point or a line and
    ///      cannot be a site boundary, which would make later area-based MRV claims meaningless.
    uint256 private constant MIN_POLYGON_POINTS = 3;

    /// @dev Bounds coordinates to the valid WGS84 range in microdegrees.
    int32 private constant MAX_LATITUDE_E6 = 90_000_000;
    int32 private constant MAX_LONGITUDE_E6 = 180_000_000;

    uint256 private _nextProjectId = 1;

    mapping(uint256 projectId => Project) private _projects;
    mapping(uint256 projectId => GeoPoint[]) private _boundaries;

    /// @notice Emitted when a new restoration site enters the registry.
    /// @dev Indexes implementer so an organisation's portfolio can be rebuilt from logs alone.
    event ProjectRegistered(
        uint256 indexed projectId,
        address indexed implementer,
        Ecosystem indexed ecosystem,
        string name,
        uint256 boundaryPointCount,
        uint64 registeredAt
    );

    /// @notice Emitted whenever a registrar suspends or reinstates a project.
    /// @dev Carries the previous status so an auditor replaying logs can detect a missed event.
    event ProjectStatusChanged(
        uint256 indexed projectId,
        Status indexed previousStatus,
        Status indexed newStatus,
        address changedBy,
        string reason
    );

    error ProjectDoesNotExist(uint256 projectId);
    error EmptyProjectName();
    error InvalidImplementer();
    error PolygonTooSmall(uint256 provided, uint256 required);
    error CoordinateOutOfRange(int32 latitudeE6, int32 longitudeE6);
    error StatusUnchanged(Status status);

    /// @notice Deploys the registry and seeds the initial administrator.
    /// @dev The deployer is granted REGISTRAR_ROLE as well so a fresh local demo chain is
    ///      usable in one transaction; on a real deployment the admin would revoke it.
    /// @param admin Address receiving DEFAULT_ADMIN_ROLE and REGISTRAR_ROLE.
    constructor(address admin) {
        if (admin == address(0)) revert InvalidImplementer();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
    }

    /// @notice Onboards a restoration site and assigns it a permanent projectId.
    /// @dev Gated to REGISTRAR_ROLE because registration is the point where a real-world
    ///      due-diligence check is attested to on chain; letting anyone call it would make
    ///      every downstream credit meaningless.
    /// @param name Human-readable site name, shown in the registry UI.
    /// @param ecosystem Habitat type, which selects the MRV methodology applied off chain.
    /// @param implementer Organisation authorised to submit MRV data and receive issued credits.
    /// @param boundary Site polygon as microdegree vertices, assumed closed (last point joins first).
    /// @return projectId The identifier every later verification and credit batch refers to.
    function registerProject(
        string calldata name,
        Ecosystem ecosystem,
        address implementer,
        GeoPoint[] calldata boundary
    ) external onlyRole(REGISTRAR_ROLE) returns (uint256 projectId) {
        if (bytes(name).length == 0) revert EmptyProjectName();
        if (implementer == address(0)) revert InvalidImplementer();
        if (boundary.length < MIN_POLYGON_POINTS) {
            revert PolygonTooSmall(boundary.length, MIN_POLYGON_POINTS);
        }

        projectId = _nextProjectId++;

        _projects[projectId] = Project({
            id: projectId,
            name: name,
            ecosystem: ecosystem,
            implementer: implementer,
            registeredAt: uint64(block.timestamp),
            status: Status.Active
        });

        GeoPoint[] storage stored = _boundaries[projectId];
        for (uint256 i = 0; i < boundary.length; i++) {
            GeoPoint calldata point = boundary[i];
            // Reject impossible coordinates here rather than downstream: a bad polygon that
            // reaches the MRV pipeline would silently produce an unverifiable area claim.
            if (
                point.latitudeE6 > MAX_LATITUDE_E6 ||
                point.latitudeE6 < -MAX_LATITUDE_E6 ||
                point.longitudeE6 > MAX_LONGITUDE_E6 ||
                point.longitudeE6 < -MAX_LONGITUDE_E6
            ) {
                revert CoordinateOutOfRange(point.latitudeE6, point.longitudeE6);
            }
            stored.push(point);
        }

        emit ProjectRegistered(
            projectId,
            implementer,
            ecosystem,
            name,
            boundary.length,
            uint64(block.timestamp)
        );
    }

    /// @notice Suspends or reinstates a project.
    /// @dev Suspension is the registry's lever when a site fails an audit or a dispute is
    ///      raised: it stops new verification submissions without erasing history, which
    ///      matters because already-issued credits must remain valid and tradeable.
    /// @param projectId Project to update.
    /// @param newStatus Status to move to; must differ from the current one.
    /// @param reason Free-text justification recorded in the event for auditors.
    function setProjectStatus(
        uint256 projectId,
        Status newStatus,
        string calldata reason
    ) external onlyRole(REGISTRAR_ROLE) {
        Project storage project = _requireProject(projectId);

        Status previousStatus = project.status;
        if (previousStatus == newStatus) revert StatusUnchanged(newStatus);

        project.status = newStatus;

        emit ProjectStatusChanged(projectId, previousStatus, newStatus, msg.sender, reason);
    }

    /// @notice Reads a project's identity record.
    /// @dev Reverts on unknown ids instead of returning a zeroed struct, so callers cannot
    ///      mistake "never registered" for a real project owned by address(0).
    /// @param projectId Project to read.
    /// @return The stored project record.
    function getProject(uint256 projectId) external view returns (Project memory) {
        return _requireProject(projectId);
    }

    /// @notice Returns the full site boundary polygon.
    /// @dev Separate from getProject because the polygon is unbounded in length and callers
    ///      listing many projects should not pay to load every vertex.
    /// @param projectId Project to read.
    /// @return The boundary vertices in registration order.
    function getProjectBoundary(uint256 projectId) external view returns (GeoPoint[] memory) {
        _requireProject(projectId);
        return _boundaries[projectId];
    }

    /// @notice Reports whether a project exists and is currently allowed to generate credits.
    /// @dev The single check other NeelKosh contracts call before accepting MRV data, kept as
    ///      one function so the "may this project act" rule lives in exactly one place.
    /// @param projectId Project to check.
    /// @return True only for a registered project in Active status.
    function isProjectActive(uint256 projectId) external view returns (bool) {
        Project storage project = _projects[projectId];
        return project.id != 0 && project.status == Status.Active;
    }

    /// @notice Returns the organisation authorised to act for a project.
    /// @dev Used by VerificationRegistry to authorise submissions and by CarbonCreditToken to
    ///      decide who receives newly issued credits.
    /// @param projectId Project to read.
    /// @return The implementing organisation's address.
    function getImplementer(uint256 projectId) external view returns (address) {
        return _requireProject(projectId).implementer;
    }

    /// @notice Number of vertices in a project's boundary.
    /// @dev Lets a UI size its map request before pulling the whole polygon.
    /// @param projectId Project to read.
    /// @return The vertex count.
    function getBoundaryPointCount(uint256 projectId) external view returns (uint256) {
        _requireProject(projectId);
        return _boundaries[projectId].length;
    }

    /// @notice Total number of projects ever registered.
    /// @dev Ids are sequential from 1, so this doubles as the upper bound for enumeration.
    /// @return The count of registered projects.
    function totalProjects() external view returns (uint256) {
        return _nextProjectId - 1;
    }

    /// @dev Loads a project or reverts, so every accessor fails loudly on an unknown id.
    function _requireProject(uint256 projectId) private view returns (Project storage project) {
        project = _projects[projectId];
        if (project.id == 0) revert ProjectDoesNotExist(projectId);
    }
}
