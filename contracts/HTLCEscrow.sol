// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title HTLCEscrow
 * @notice Hash Time Locked Contract for trustless cUSD transfers
 * @dev Recipients claim funds by revealing a secret that hashes to the stored hashLock
 */
contract HTLCEscrow is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Locked,
        Claimed,
        Refunded,
        Cancelled
    }

    struct Transfer {
        address sender;
        address token;
        uint96 amount;
        bytes32 hashLock;  // keccak256(secret)
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

    struct LockParams {
        bytes32 transferId;
        address token;
        address fundingWallet;
        uint96 amount;
        bytes32 hashLock;
        uint40 expiry;
    }

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    mapping(bytes32 => Transfer) private transfers;
    mapping(address => uint256) public lockedBalance;

    event TransferLocked(bytes32 indexed transferId, address indexed sender, bytes32 indexed hashLock, address token, uint96 amount, uint40 expiry);
    event TransferClaimed(bytes32 indexed transferId, address indexed recipient);
    event TransferRefunded(bytes32 indexed transferId, address indexed refundAddress);
    event TransferCancelled(bytes32 indexed transferId, address indexed sender);

    error TransferExists();
    error InvalidExpiry();
    error InvalidAmount();
    error InvalidHashLock();
    error InvalidAddress();
    error TransferNotLocked();
    error NotYetExpired();
    error AlreadyExpired();
    error InvalidSecret();
    error NotAuthorized();

    constructor(address admin) {
        require(admin != address(0), "admin required");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /**
     * @notice Lock funds with a hash lock
     * @dev Can be called by anyone (sender or on their behalf)
     */
    function lockFunds(LockParams calldata params, PermitInput calldata permit) external whenNotPaused nonReentrant {
        _validateLockParams(params);

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
            hashLock: params.hashLock,
            expiry: params.expiry,
            status: Status.Locked
        });

        lockedBalance[params.token] += params.amount;

        emit TransferLocked(params.transferId, params.fundingWallet, params.hashLock, params.token, params.amount, params.expiry);
    }

    /**
     * @notice Claim funds by revealing the secret
     * @dev Anyone with the correct secret can claim
     * @param transferId The transfer ID
     * @param secret The secret that hashes to hashLock
     */
    function claim(bytes32 transferId, bytes32 secret) external whenNotPaused nonReentrant {
        Transfer storage transferData = transfers[transferId];
        if (transferData.status != Status.Locked) revert TransferNotLocked();
        
        // Verify the secret matches the hash lock
        if (keccak256(abi.encodePacked(secret)) != transferData.hashLock) revert InvalidSecret();
        
        if (block.timestamp >= transferData.expiry) revert AlreadyExpired();

        transferData.status = Status.Claimed;
        uint96 amount = transferData.amount;
        transferData.amount = 0;
        lockedBalance[transferData.token] -= amount;

        IERC20(transferData.token).safeTransfer(msg.sender, amount);
        emit TransferClaimed(transferId, msg.sender);
    }

    /**
     * @notice Claim funds to a specific recipient by revealing the secret
     * @dev Enables gasless claims - relayer can pay gas and send funds to recipient
     * @param transferId The transfer ID
     * @param secret The secret that hashes to hashLock
     * @param recipient The address to receive the claimed funds
     */
    function claimTo(bytes32 transferId, bytes32 secret, address recipient) external whenNotPaused nonReentrant {
        Transfer storage transferData = transfers[transferId];
        if (transferData.status != Status.Locked) revert TransferNotLocked();
        
        // Verify the secret matches the hash lock
        if (keccak256(abi.encodePacked(secret)) != transferData.hashLock) revert InvalidSecret();
        
        if (block.timestamp >= transferData.expiry) revert AlreadyExpired();
        if (recipient == address(0)) revert InvalidAddress();

        transferData.status = Status.Claimed;
        uint96 amount = transferData.amount;
        transferData.amount = 0;
        lockedBalance[transferData.token] -= amount;

        IERC20(transferData.token).safeTransfer(recipient, amount);
        emit TransferClaimed(transferId, recipient);
    }


    /**
     * @notice Refund locked funds after expiry
     * @dev Only the original sender can refund
     */
    function refund(bytes32 transferId) external nonReentrant {
        Transfer storage transferData = transfers[transferId];
        if (transferData.status != Status.Locked) revert TransferNotLocked();
        if (msg.sender != transferData.sender) revert NotAuthorized();
        if (block.timestamp < transferData.expiry) revert NotYetExpired();

        transferData.status = Status.Refunded;
        uint96 amount = transferData.amount;
        transferData.amount = 0;
        lockedBalance[transferData.token] -= amount;

        IERC20(transferData.token).safeTransfer(transferData.sender, amount);
        emit TransferRefunded(transferId, transferData.sender);
    }

    /**
     * @notice Cancel a pending transfer (sender can cancel anytime before claim)
     * @dev Only the original sender can cancel. Does not require expiry.
     */
    function cancel(bytes32 transferId) external nonReentrant {
        Transfer storage transferData = transfers[transferId];
        if (transferData.status != Status.Locked) revert TransferNotLocked();
        if (msg.sender != transferData.sender) revert NotAuthorized();

        transferData.status = Status.Cancelled;
        uint96 amount = transferData.amount;
        transferData.amount = 0;
        lockedBalance[transferData.token] -= amount;

        IERC20(transferData.token).safeTransfer(transferData.sender, amount);
        emit TransferCancelled(transferId, transferData.sender);
    }

    /**
     * @notice Get transfer details
     */
    function getTransfer(bytes32 transferId) external view returns (Transfer memory) {
        return transfers[transferId];
    }

    /**
     * @notice Get transfer status
     */
    function transferStatus(bytes32 transferId) external view returns (Status) {
        return transfers[transferId].status;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _validateLockParams(LockParams calldata params) private view {
        if (params.transferId == bytes32(0)) revert InvalidHashLock();
        if (params.amount == 0) revert InvalidAmount();
        if (params.hashLock == bytes32(0)) revert InvalidHashLock();
        if (params.expiry <= block.timestamp) revert InvalidExpiry();
        if (params.token == address(0) || params.fundingWallet == address(0)) revert InvalidAddress();
    }
}
