// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.5;

interface IAMMFactory {
    // 原有事件
    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint
    );

    // 自定义事件（不与 AccessControl 冲突）
    event FeeToUpdated(address indexed oldFeeTo, address indexed newFeeTo);
    event FeeToSetterUpdated(
        address indexed oldFeeToSetter,
        address indexed newFeeToSetter
    );

    // 原有函数
    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);

    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function createPair(
        address tokenA,
        address tokenB
    ) external returns (address pair);

    function setFeeTo(address) external;
    function setFeeToSetter(address) external;

    // 新增 RBAC 相关函数

    // 角色常量（通过函数返回）
    function ADMIN_ROLE() external pure returns (bytes32);
    function PAIR_CREATOR_ROLE() external pure returns (bytes32);
    function FEE_MANAGER_ROLE() external pure returns (bytes32);
    function PAUSER_ROLE() external pure returns (bytes32);

    // 批量角色管理
    function grantRoleBatch(bytes32 role, address[] calldata accounts) external;
    function revokeRoleBatch(
        bytes32 role,
        address[] calldata accounts
    ) external;

    // 权限检查函数
    function canCreatePair(address account) external view returns (bool);
    function canManageFees(address account) external view returns (bool);
    function canPause(address account) external view returns (bool);

    // 紧急停止
    function emergencyStop() external;
}
