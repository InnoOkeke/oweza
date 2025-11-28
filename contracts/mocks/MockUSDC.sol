// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MockUSDC is ERC20, ERC20Permit {
    uint8 private constant _DECIMALS = 6;

    constructor() ERC20("Mock USDC", "mUSDC") ERC20Permit("Mock USDC") {
        _mint(msg.sender, 1_000_000_000 * (10 ** _DECIMALS));
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
