# AMM配对合约 (AMMTokenPair)

## 概述

AMMTokenPair 是一个可升级的 AMM（自动做市商）配对合约，实现了基于恒定乘积公式（x * y = k）的去中心化交易对。每个交易对都有一个独立的配对合约实例，支持两种 ERC20 代币之间的流动性提供和交换。

## 合约特性

- **可升级性**: 基于 OpenZeppelin 的可升级合约框架
- **安全性**: 集成重入保护、暂停机制和所有权控制
- **ERC20 兼容**: 流动性代币符合 ERC20 标准，支持 EIP-2612 许可
- **价格预言机**: 内置累积价格预言机功能
- **手续费机制**: 支持协议费用收取

## 继承结构

```solidity
contract AMMTokenPair is
    Initializable,
    ERC20PermitUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    OwnableUpgradeable,
    IAMMTokenPair
```

## 状态变量

### 常量
- `MINIMUM_LIQUIDITY`: 最小流动性 = 1000
- `SELECTOR`: transfer 函数选择器

### 核心变量
- `factory`: 工厂合约地址
- `token0`: 第一个代币地址
- `token1`: 第二个代币地址
- `reserve0`: 代币0的储备量
- `reserve1`: 代币1的储备量
- `blockTimestampLast`: 最后更新储备量的时间戳
- `price0CumulativeLast`: 代币0的累积价格
- `price1CumulativeLast`: 代币1的累积价格
- `kLast`: 最近一次流动性事件后的 K 值

## 主要功能

### 初始化和管理

#### `constructor()`
- 禁用初始化器，确保只能通过代理合约使用

#### `initialize(address _token0, address _token1)`
- 初始化交易对合约
- 设置 ERC20 代币名称为 "AMM"
- 初始化各种可升级组件
- 设置工厂地址和代币地址

#### `pause()` / `unpause()`
- 紧急暂停/恢复功能
- 只有合约所有者可以调用

### 核心交易功能

#### `mint(address to) → uint256 liquidity`
**流动性铸造**
- 为流动性提供者铸造 LP 代币
- 使用恒定乘积公式计算流动性份额
- 首次添加流动性时永久锁定 MINIMUM_LIQUIDITY
- 包含重入保护和暂停检查

#### `burn(address to) → (uint256 amount0, uint256 amount1)`
**流动性销毁**
- 销毁 LP 代币并返还对应的代币
- 按比例分配代币给流动性提供者
- 包含重入保护和暂停检查

#### `swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data)`
**代币交换**
- 执行代币交换操作
- 支持闪电贷功能（通过回调数据）
- 收取 0.3% 的交易手续费
- 验证恒定乘积公式 (x * y ≥ k)
- 包含重入保护和暂停检查

### 辅助功能

#### `getReserves() → (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)`
- 获取当前储备量和最后更新时间

#### `skim(address to)`
- 强制平衡，将超出储备量的代币发送到指定地址
- 用于处理直接转账到合约的代币

#### `sync()`
- 强制同步储备量与实际余额
- 用于处理异常情况

### 内部功能

#### `_safeTransfer(address token, address to, uint256 value)`
- 安全的代币转账函数
- 处理不同 ERC20 实现的兼容性问题

#### `_update(uint256 balance0, uint256 balance1, uint112 _reserve0, uint112 _reserve1)`
- 更新储备量和累积价格
- 实现价格预言机功能
- 防止溢出攻击

#### `_mintFee(uint112 _reserve0, uint112 _reserve1) → bool feeOn`
- 协议费用铸造
- 向 feeTo 地址铸造相当于增长 sqrt(k) 的 1/6 的流动性

## 事件

- `Mint(address indexed sender, uint256 amount0, uint256 amount1)`
- `Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)`
- `Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)`
- `Sync(uint112 reserve0, uint112 reserve1)`

## 安全特性

1. **重入保护**: 所有外部函数都使用 `nonReentrant` 修饰符
2. **暂停机制**: 关键功能可以在紧急情况下暂停
3. **所有权控制**: 重要管理功能仅限所有者访问
4. **溢出保护**: 使用 SafeMath 和类型检查防止溢出
5. **K 值验证**: 确保交换后恒定乘积公式成立

## 手续费机制

- **交易手续费**: 每笔交换收取 0.3% 手续费
- **协议费用**: 可选的协议费用，向指定地址铸造额外流动性
- **费用分配**: 交易手续费自动分配给流动性提供者

## 价格预言机

合约内置累积价格预言机功能：
- `price0CumulativeLast`: 代币0相对于代币1的累积价格
- `price1CumulativeLast`: 代币1相对于代币0的累积价格
- 使用 UQ112x112 定点数格式确保精度

## 使用示例

### 添加流动性
```solidity
// 1. 将代币转账到配对合约
token0.transfer(pair, amount0);
token1.transfer(pair, amount1);

// 2. 铸造流动性代币
uint256 liquidity = pair.mint(to);
```

### 移除流动性
```solidity
// 1. 将 LP 代币转账到配对合约
pair.transfer(pair, liquidity);

// 2. 销毁 LP 代币并获取代币
(uint256 amount0, uint256 amount1) = pair.burn(to);
```

### 代币交换
```solidity
// 1. 将输入代币转账到配对合约
tokenIn.transfer(pair, amountIn);

// 2. 执行交换
pair.swap(amount0Out, amount1Out, to, new bytes(0));
```

## 注意事项

1. **最小流动性**: 首次添加流动性时会永久锁定 1000 个最小流动性单位
2. **代币顺序**: token0 和 token1 的顺序由工厂合约确定
3. **闪电贷**: 通过 swap 函数的 data 参数可以实现闪电贷功能
4. **价格影响**: 大额交易可能产生显著的价格影响
5. **无常损失**: 流动性提供者面临无常损失风险

## 可升级性

合约使用 OpenZeppelin 的可升级合约模式：
- 通过代理合约部署
- 支持逻辑合约升级
- 保持状态数据不变
- 需要谨慎处理存储布局变更
