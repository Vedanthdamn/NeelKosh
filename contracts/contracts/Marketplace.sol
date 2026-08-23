// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";
import {ICarbonCreditToken} from "./interfaces/ICarbonCreditToken.sol";

/// @title Marketplace
/// @notice Lets an NGO list issued carbon credits for sale and a buyer purchase them with
///         SimStablecoin, splitting the proceeds between the selling NGO, the platform treasury
///         and a community fund on every purchase.
/// @dev Escrow model: a listed batch moves into this contract (ERC1155Holder) at list time
///      rather than staying with the seller and being pulled at purchase time. That guarantees
///      a listing's `amount` is always actually available to buy — the seller cannot transfer
///      or re-list the same credits elsewhere out from under a pending listing.
contract Marketplace is AccessControl, ERC1155Holder {
    /// @dev Denominator revenue-split percentages are expressed against. Basis points (1/100 of
    ///      a percent) rather than plain percent so the split can be tuned finer than whole
    ///      points without rewriting the type.
    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice Carbon credits this marketplace trades.
    ICarbonCreditToken public immutable creditToken;

    /// @notice ERC-20 currency buyers pay in.
    IERC20 public immutable stablecoin;

    /// @notice Registry consulted to confirm a lister is the project's implementer.
    IProjectRegistry public immutable projectRegistry;

    /// @notice Address receiving the platform's share of every purchase.
    address public immutable platformTreasury;

    /// @notice Address receiving the community fund's share of every purchase.
    address public immutable communityFund;

    /// @notice Seller's current share of a purchase, in basis points.
    uint256 public ngoBps;

    /// @notice Platform treasury's current share of a purchase, in basis points.
    uint256 public platformBps;

    /// @notice Community fund's current share of a purchase, in basis points.
    uint256 public communityBps;

    /// @notice One listed batch of carbon credits.
    /// @dev `amount` is the quantity still available — it decreases as buyCredits fills the
    ///      listing and is not a fixed original size. `active` is only ever cleared by
    ///      cancelListing; a fully sold listing (amount == 0) is left active but unbuyable,
    ///      since "sold out" and "withdrawn by the seller" are different histories worth being
    ///      able to tell apart later.
    struct Listing {
        uint256 id;
        uint256 tokenId;
        address seller;
        uint256 amount;
        uint256 pricePerTonne;
        bool active;
    }

    uint256 private _nextListingId = 1;
    mapping(uint256 listingId => Listing) private _listings;

    /// @notice Emitted when an NGO lists credits for sale.
    event CreditsListed(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 amount,
        uint256 pricePerTonne
    );

    error InvalidAddress();
    error InvalidSplit(uint256 totalBps);
    error NotProjectImplementer(address caller, address implementer);
    error ZeroAmount();
    error ZeroPrice();
    error ListingDoesNotExist(uint256 listingId);

    /// @notice Deploys the marketplace bound to the credit token, payment currency and payout
    ///         split it will use for every purchase.
    /// @param admin Address receiving DEFAULT_ADMIN_ROLE.
    /// @param creditToken_ ERC-1155 carbon credit contract being traded.
    /// @param stablecoin_ ERC-20 currency buyers pay in.
    /// @param projectRegistry_ Registry used to confirm a lister is the project's implementer.
    /// @param platformTreasury_ Recipient of the platform's cut of every purchase.
    /// @param communityFund_ Recipient of the community fund's cut of every purchase.
    /// @param ngoBps_ Seller's share of a purchase, in basis points.
    /// @param platformBps_ Platform treasury's share, in basis points.
    /// @param communityBps_ Community fund's share, in basis points; the three must sum to 10,000.
    constructor(
        address admin,
        address creditToken_,
        address stablecoin_,
        address projectRegistry_,
        address platformTreasury_,
        address communityFund_,
        uint256 ngoBps_,
        uint256 platformBps_,
        uint256 communityBps_
    ) {
        if (
            admin == address(0) ||
            creditToken_ == address(0) ||
            stablecoin_ == address(0) ||
            projectRegistry_ == address(0) ||
            platformTreasury_ == address(0) ||
            communityFund_ == address(0)
        ) revert InvalidAddress();
        if (ngoBps_ + platformBps_ + communityBps_ != BPS_DENOMINATOR) {
            revert InvalidSplit(ngoBps_ + platformBps_ + communityBps_);
        }

        creditToken = ICarbonCreditToken(creditToken_);
        stablecoin = IERC20(stablecoin_);
        projectRegistry = IProjectRegistry(projectRegistry_);
        platformTreasury = platformTreasury_;
        communityFund = communityFund_;
        ngoBps = ngoBps_;
        platformBps = platformBps_;
        communityBps = communityBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Lists a batch of carbon credits for sale.
    /// @dev Restricted to the project's implementer, recovered from the token id via
    ///      CarbonCreditToken.decodeTokenId and cross-checked against ProjectRegistry — the same
    ///      registry every other NeelKosh contract trusts for "who may act for this project",
    ///      so listing rights can never drift out of sync with issuance rights. The credits move
    ///      into escrow immediately (see the contract-level dev note), which requires the seller
    ///      to have called `creditToken.setApprovalForAll(marketplace, true)` beforehand — the
    ///      ERC-1155 equivalent of an ERC-20 approve.
    /// @param tokenId Batch to list, as packed by CarbonCreditToken.encodeTokenId.
    /// @param amount Tonnes to list.
    /// @param pricePerTonne Price per tonne in the stablecoin's smallest unit.
    /// @return listingId Identifier used to buy or cancel this listing.
    function listCredits(
        uint256 tokenId,
        uint256 amount,
        uint256 pricePerTonne
    ) external returns (uint256 listingId) {
        if (amount == 0) revert ZeroAmount();
        if (pricePerTonne == 0) revert ZeroPrice();

        (uint256 projectId, ) = creditToken.decodeTokenId(tokenId);
        address implementer = projectRegistry.getImplementer(projectId);
        if (msg.sender != implementer) revert NotProjectImplementer(msg.sender, implementer);

        listingId = _nextListingId++;
        _listings[listingId] = Listing({
            id: listingId,
            tokenId: tokenId,
            seller: msg.sender,
            amount: amount,
            pricePerTonne: pricePerTonne,
            active: true
        });

        creditToken.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        emit CreditsListed(listingId, tokenId, msg.sender, amount, pricePerTonne);
    }

    /// @notice Reads a listing.
    /// @dev Reverts on unknown ids so a caller cannot mistake a zeroed struct for a real listing.
    /// @param listingId Listing to read.
    /// @return The stored listing record.
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _requireListing(listingId);
    }

    /// @notice Total number of listings ever created.
    /// @dev Ids are sequential from 1, so this doubles as the upper bound for enumeration.
    /// @return The listing count.
    function totalListings() external view returns (uint256) {
        return _nextListingId - 1;
    }

    /// @notice Standard ERC-165 support check.
    /// @dev Resolves the AccessControl and ERC1155Holder implementations, which both define it.
    /// @param interfaceId Interface identifier being queried.
    /// @return True when the interface is supported.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Loads a listing or reverts, so every accessor fails loudly on an unknown id.
    function _requireListing(uint256 listingId) private view returns (Listing storage listing) {
        listing = _listings[listingId];
        if (listing.id == 0) revert ListingDoesNotExist(listingId);
    }
}
