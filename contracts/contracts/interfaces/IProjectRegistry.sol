// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IProjectRegistry
/// @notice The slice of the project registry that other NeelKosh contracts depend on.
/// @dev Deliberately narrow: issuance and verification only ever need to know who acts for a
///      project and whether it is currently in good standing. Keeping the dependency this
///      small means the registry can grow without forcing redeploys downstream.
interface IProjectRegistry {
    /// @notice Reports whether a project exists and is currently allowed to generate credits.
    /// @param projectId Project to check.
    /// @return True only for a registered project in Active status.
    function isProjectActive(uint256 projectId) external view returns (bool);

    /// @notice Returns the organisation authorised to act for a project.
    /// @param projectId Project to read.
    /// @return The implementing organisation's address.
    function getImplementer(uint256 projectId) external view returns (address);
}
