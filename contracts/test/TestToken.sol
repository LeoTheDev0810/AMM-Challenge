// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.5;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TestToken
 * @dev 通用ERC20 Token，用于测试AMM平台
 * @dev 可通过构造函数传入不同的name和symbol来实例化不同的token
 */
contract TestToken is ERC20, Ownable {
    /**
     * @dev 构造函数，创建具有指定名称和符号的token
     * @param name Token名称
     * @param symbol Token符号
     * @param initialSupply 初始供应量（以wei为单位）
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _mint(msg.sender, initialSupply);
    }

    /**
     * @dev 铸造新的token
     * @param to 接收token的地址
     * @param amount 铸造数量
     * @return 操作是否成功
     */
    function mint(address to, uint256 amount) public onlyOwner returns (bool) {
        _mint(to, amount);
        return true;
    }

    /**
     * @dev 销毁token
     * @param from 销毁token的地址
     * @param amount 销毁数量
     * @return 操作是否成功
     */
    function burn(
        address from,
        uint256 amount
    ) public onlyOwner returns (bool) {
        _burn(from, amount);
        return true;
    }
}
