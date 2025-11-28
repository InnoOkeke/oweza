// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SharedEscrow
 * @notice Custodies pending cUSD transfers for Oweza users inside a single audited contract.
 */
contract SharedEscrow is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Pending,
        Claimed,
        Refunded,
        Expired
    }

    struct Transfer {
        address sender;
        address token;
        uint96 amount;
        bytes32 recipientHash;
        uint40 expiry;
        Status status;
    }

    struct PermitInput {
        bool enabled;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct CreateParams {
        bytes32 transferId;
        address token;
        address fundingWallet;
        uint96 amount;
        bytes32 recipientHash;
        uint40 expiry;
    }

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    mapping(bytes32 => Transfer) private transfers;
    mapping(address => uint256) public lockedBalance;

    event TransferCreated(bytes32 indexed transferId, address indexed sender, bytes32 indexed recipientHash, address token, uint96 amount, uint40 expiry);
    event TransferClaimed(bytes32 indexed transferId, address indexed recipient);
    event TransferRefunded(bytes32 indexed transferId, address indexed refundAddress);
    event TransferExpired(bytes32 indexed transferId);

    error TransferExists();
    error InvalidExpiry();
    error InvalidAmount();
    error InvalidRecipientHash();
    error InvalidAddress();
    error TransferNotPending();
    error NotYetExpired();
    error AlreadyExpired();

    constructor(address admin) {
        require(admin != address(0), "admin required");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function createTransfer(CreateParams calldata params, PermitInput calldata permit) external whenNotPaused onlyRole(OPERATOR_ROLE) nonReentrant {
        _validateCreateParams(params);
        if (permit.enabled) {
            IERC20Permit(params.token).permit(params.fundingWallet, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s);
        }

        Transfer storage existing = transfers[params.transferId];
        if (existing.status != Status.None) revert TransferExists();

        IERC20(params.token).safeTransferFrom(params.fundingWallet, address(this), params.amount);

        transfers[params.transferId] = Transfer({
            sender: params.fundingWallet,
            token: params.token,
            amount: params.amount,
            recipientHash: params.recipientHash,
            expiry: params.expiry,
            status: Status.Pending
        });

        lockedBalance[params.token] += params.amount;

        emit TransferCreated(params.transferId, params.fundingWallet, params.recipientHash, params.token, params.amount, params.expiry);
    }

    function claimTransfer(bytes32 transferId, address recipient, bytes32 expectedRecipientHash) external whenNotPaused onlyRole(OPERATOR_ROLE) nonReentrant {
        Transfer storage transferData = transfers[transferId];
        if (transferData.status != Status.Pending) revert TransferNotPending();
        if (transferData.recipientHash != expectedRecipientHash || expectedRecipientHash == bytes32(0)) revert InvalidRecipientHash();
        if (block.timestamp >= transferData.expiry) revert AlreadyExpired();

        transferData.status = Status.Claimed;
        uint96 amount = transferData.amount;
        transferData.amount = 0;
        lockedBalance[transferData.token] -= amount;

        IERC20(transferData.token).safeTransfer(recipient, amount);
        emit TransferClaimed(transferId, recipient);
    }

    function refundTransfer(bytes32 transferId, address refundAddress) external onlyRole(OPERATOR_ROLE) nonReentrant {
        Transfer storage transferData = transfers[transferId];
        if (transferData.status != Status.Pending) revert TransferNotPending();
        if (block.timestamp < transferData.expiry) revert NotYetExpired();

        transferData.status = Status.Refunded;
        uint96 amount = transferData.amount;
        transferData.amount = 0;
        lockedBalance[transferData.token] -= amount;

        IERC20(transferData.token).safeTransfer(refundAddress, amount);
        emit TransferRefunded(transferId, refundAddress);
    }

    function expireTransfer(bytes32 transferId) external onlyRole(OPERATOR_ROLE) {
        Transfer storage transferData = transfers[transferId];
        if (transferData.status != Status.Pending) revert TransferNotPending();
        if (block.timestamp < transferData.expiry) revert NotYetExpired();

        transferData.status = Status.Expired;
        emit TransferExpired(transferId);
    }

    function getTransfer(bytes32 transferId) external view returns (Transfer memory) {
        return transfers[transferId];
    }

    function transferStatus(bytes32 transferId) external view returns (Status) {
        return transfers[transferId].status;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _validateCreateParams(CreateParams calldata params) private view {
        if (params.transferId == bytes32(0)) revert InvalidRecipientHash();
        if (params.amount == 0) revert InvalidAmount();
        if (params.recipientHash == bytes32(0)) revert InvalidRecipientHash();
        if (params.expiry <= block.timestamp) revert InvalidExpiry();
        if (params.token == address(0) || params.fundingWallet == address(0)) revert InvalidAddress();
    }
}
