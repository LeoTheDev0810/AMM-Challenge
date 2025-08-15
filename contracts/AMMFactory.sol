// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.5;

import "./interfaces/IAMMFactory.sol";
import "./AMMTokenPair.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

//AMM工厂 - 可升级版本 with RBAC
contract AMMFactory is
    IAMMFactory,
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    // 角色定义
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant PAIR_CREATOR_ROLE = keccak256("PAIR_CREATOR_ROLE");
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    address public feeTo; //收税地址
    address public feeToSetter; //收税权限控制地址（为了保持接口兼容性）
    //配对映射,地址=>(地址=>地址)
    mapping(address => mapping(address => address)) public getPair;
    //所有配对数组
    address[] public allPairs;
    //配对合约的Bytecode的hash - 预计算的常量
    bytes32 public constant INIT_CODE_PAIR_HASH =
        0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev 初始化函数，替代构造函数
     * @param _admin 管理员地址
     * @param _feeToSetter 收税权限控制地址（为了保持兼容性）
     */
    function initialize(
        address _admin,
        address _feeToSetter
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        // 设置角色管理员
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(PAIR_CREATOR_ROLE, _admin);
        _grantRole(FEE_MANAGER_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);

        // 为了保持接口兼容性
        feeToSetter = _feeToSetter;
        _grantRole(FEE_MANAGER_ROLE, _feeToSetter);
    }

    /**
     * @dev 查询配对数组长度方法
     */
    function allPairsLength() external view returns (uint) {
        return allPairs.length;
    }

    /**
     * @param tokenA TokenA
     * @param tokenB TokenB
     * @return pair 配对地址
     * @dev 创建配对 - 需要 PAIR_CREATOR_ROLE 角色
     */
    function createPair(
        address tokenA,
        address tokenB
    )
        external
        nonReentrant
        whenNotPaused
        onlyRole(PAIR_CREATOR_ROLE)
        returns (address pair)
    {
        //确认tokenA不等于tokenB
        require(tokenA != tokenB, "AMMFactory: IDENTICAL_ADDRESSES");
        //将tokenA和tokenB进行大小排序,确保tokenA小于tokenB
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        //确认token0不等于0地址
        require(token0 != address(0), "AMMFactory: ZERO_ADDRESS");
        //确认配对映射中不存在token0=>token1
        require(
            getPair[token0][token1] == address(0),
            "AMMFactory: PAIR_EXISTS"
        ); // single check is sufficient
        //给bytecode变量赋值"pair"合约的创建字节码
        bytes memory bytecode = type(AMMTokenPair).creationCode;
        //将token0和token1打包后创建哈希
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        //内联汇编
        assembly {
            //通过create2方法布署合约,并且加盐,返回地址到pair变量
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        //调用pair地址的合约中的"initialize"方法,传入变量token0,token1
        IAMMTokenPair(pair).initialize(token0, token1);
        //配对映射中设置token0=>token1=pair
        getPair[token0][token1] = pair;
        //配对映射中设置token1=>token0=pair
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        //配对数组中推入pair地址
        allPairs.push(pair);
        //触发配对成功事件
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    /**
     * @dev 设置收税地址 - 需要 FEE_MANAGER_ROLE 角色
     * @param _feeTo 收税地址
     */
    function setFeeTo(address _feeTo) external onlyRole(FEE_MANAGER_ROLE) {
        address oldFeeTo = feeTo;
        feeTo = _feeTo;
        emit FeeToUpdated(oldFeeTo, _feeTo);
    }

    /**
     * @dev 收税权限控制 - 需要 ADMIN_ROLE 角色
     * @param _feeToSetter 收税权限控制
     */
    function setFeeToSetter(
        address _feeToSetter
    ) external onlyRole(ADMIN_ROLE) {
        address oldFeeToSetter = feeToSetter;

        // 移除旧地址的 FEE_MANAGER_ROLE
        if (oldFeeToSetter != address(0)) {
            _revokeRole(FEE_MANAGER_ROLE, oldFeeToSetter);
        }

        // 给新地址授予 FEE_MANAGER_ROLE
        if (_feeToSetter != address(0)) {
            _grantRole(FEE_MANAGER_ROLE, _feeToSetter);
        }

        feeToSetter = _feeToSetter;
        emit FeeToSetterUpdated(oldFeeToSetter, _feeToSetter);
    }

    /**
     * @dev 暂停合约 - 需要 PAUSER_ROLE 角色
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev 恢复合约 - 需要 PAUSER_ROLE 角色
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev 批量授予角色 - 需要 ADMIN_ROLE 角色
     * @param role 角色
     * @param accounts 账户数组
     */
    function grantRoleBatch(
        bytes32 role,
        address[] calldata accounts
    ) external onlyRole(ADMIN_ROLE) {
        for (uint256 i = 0; i < accounts.length; i++) {
            _grantRole(role, accounts[i]);
        }
    }

    /**
     * @dev 批量撤销角色 - 需要 ADMIN_ROLE 角色
     * @param role 角色
     * @param accounts 账户数组
     */
    function revokeRoleBatch(
        bytes32 role,
        address[] calldata accounts
    ) external onlyRole(ADMIN_ROLE) {
        for (uint256 i = 0; i < accounts.length; i++) {
            _revokeRole(role, accounts[i]);
        }
    }

    /**
     * @dev 检查地址是否有创建配对的权限
     * @param account 要检查的地址
     * @return 是否有权限
     */
    function canCreatePair(address account) external view returns (bool) {
        return hasRole(PAIR_CREATOR_ROLE, account);
    }

    /**
     * @dev 检查地址是否有管理费用的权限
     * @param account 要检查的地址
     * @return 是否有权限
     */
    function canManageFees(address account) external view returns (bool) {
        return hasRole(FEE_MANAGER_ROLE, account);
    }

    /**
     * @dev 检查地址是否有暂停权限
     * @param account 要检查的地址
     * @return 是否有权限
     */
    function canPause(address account) external view returns (bool) {
        return hasRole(PAUSER_ROLE, account);
    }

    /**
     * @dev 紧急停止所有操作 - 需要 DEFAULT_ADMIN_ROLE
     */
    function emergencyStop() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
}
