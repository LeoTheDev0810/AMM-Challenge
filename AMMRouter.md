# AMM路由合约 (AMMRouter01)

## 概述

AMMRouter01 是一个可升级的 AMM 路由合约，为用户提供便捷的流动性管理和代币交换功能。该合约作为用户与 AMM 交易对合约之间的中间层，简化了复杂的交互流程，支持多种交易场景。

## 合约特性

- **可升级性**: 基于 OpenZeppelin 的可升级合约框架
- **安全性**: 集成重入保护和所有权控制
- **多路径交换**: 支持通过多个交易对进行代币交换
- **ETH 支持**: 原生支持 ETH 与 WETH 的自动转换
- **许可证支持**: 支持 EIP-2612 许可证功能
- **收费代币支持**: 支持收取转账费用的代币

## 继承结构

```solidity
contract AMMRouter01 is
    IAMMRouter01,
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable
```

## 状态变量

- `_factory`: 工厂合约地址
- `_WETH`: WETH 合约地址

## 修饰符

### `ensure(uint256 deadline)`
确保交易在指定的截止时间之前执行，防止交易在不利的市场条件下被执行。

## 主要功能

### 初始化和管理

#### `constructor()`
- 禁用初始化器，确保只能通过代理合约使用

#### `initialize(address _factoryAddr, address _WETHAddr)`
- 初始化路由合约
- 设置工厂合约和 WETH 合约地址
- 初始化可升级组件

#### `factory() → address`
- 返回工厂合约地址

#### `WETH() → address`
- 返回 WETH 合约地址

#### `receive()`
- 接收 ETH 的回退函数
- 只接受来自 WETH 合约的 ETH

### 流动性管理

#### 添加流动性

##### `addLiquidity()`
**添加 ERC20 代币流动性**
```solidity
function addLiquidity(
    address tokenA,
    address tokenB,
    uint256 amountADesired,
    uint256 amountBDesired,
    uint256 amountAMin,
    uint256 amountBMin,
    address to,
    uint256 deadline
) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)
```

**功能流程：**
1. 如果交易对不存在，自动创建新的交易对
2. 根据当前储备量计算最优的代币数量
3. 将代币转移到交易对合约
4. 铸造流动性代币给指定地址

##### `addLiquidityETH()`
**添加 ETH/ERC20 流动性**
```solidity
function addLiquidityETH(
    address token,
    uint256 amountTokenDesired,
    uint256 amountTokenMin,
    uint256 amountETHMin,
    address to,
    uint256 deadline
) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
```

**功能流程：**
1. 自动将 ETH 转换为 WETH
2. 计算最优的代币和 ETH 数量
3. 添加 Token/WETH 流动性
4. 退还多余的 ETH

#### 移除流动性

##### `removeLiquidity()`
**移除 ERC20 代币流动性**
```solidity
function removeLiquidity(
    address tokenA,
    address tokenB,
    uint256 liquidity,
    uint256 amountAMin,
    uint256 amountBMin,
    address to,
    uint256 deadline
) public returns (uint256 amountA, uint256 amountB)
```

**功能流程：**
1. 将流动性代币转移到交易对合约
2. 销毁流动性代币
3. 按比例返还对应的代币
4. 验证返还数量满足最小要求

##### `removeLiquidityETH()`
**移除 ETH/ERC20 流动性**
```solidity
function removeLiquidityETH(
    address token,
    uint256 liquidity,
    uint256 amountTokenMin,
    uint256 amountETHMin,
    address to,
    uint256 deadline
) public returns (uint256 amountToken, uint256 amountETH)
```

**功能流程：**
1. 移除 Token/WETH 流动性
2. 自动将 WETH 转换为 ETH
3. 将代币和 ETH 发送给指定地址

#### 许可证支持

##### `removeLiquidityWithPermit()`
**使用许可证移除流动性**
- 支持 EIP-2612 许可证
- 无需预先批准即可移除流动性
- 使用链下签名进行授权

##### `removeLiquidityETHWithPermit()`
**使用许可证移除 ETH 流动性**
- 结合许可证功能和 ETH 支持
- 提供最佳的用户体验

### 代币交换

#### 基础交换功能

##### `swapExactTokensForTokens()`
**精确输入代币交换**
```solidity
function swapExactTokensForTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline
) external returns (uint256[] memory amounts)
```

**特点：**
- 输入数量固定，输出数量可变
- 支持多跳交换（通过路径数组）
- 保证最小输出数量

##### `swapTokensForExactTokens()`
**精确输出代币交换**
```solidity
function swapTokensForExactTokens(
    uint256 amountOut,
    uint256 amountInMax,
    address[] calldata path,
    address to,
    uint256 deadline
) external returns (uint256[] memory amounts)
```

**特点：**
- 输出数量固定，输入数量可变
- 限制最大输入数量
- 适用于需要精确输出的场景

#### ETH 交换功能

##### `swapExactETHForTokens()`
**ETH 换代币（精确输入）**
- 自动处理 ETH 到 WETH 的转换
- 路径第一个地址必须是 WETH

##### `swapTokensForExactETH()`
**代币换 ETH（精确输出）**
- 路径最后一个地址必须是 WETH
- 自动将 WETH 转换为 ETH

##### `swapExactTokensForETH()`
**代币换 ETH（精确输入）**
- 支持将任意代币换成 ETH
- 自动处理 WETH 到 ETH 的转换

##### `swapETHForExactTokens()`
**ETH 换代币（精确输出）**
- 退还多余的 ETH
- 提供最佳的用户体验

#### 收费代币支持

某些代币在转账时会收取费用，标准的交换函数可能无法正确处理这种情况。为此，合约提供了专门的支持函数：

##### `swapExactTokensForTokensSupportingFeeOnTransferTokens()`
**支持收费的代币交换**
- 不依赖预计算的输出数量
- 基于实际余额变化计算结果
- 适用于收取转账费用的代币

##### `swapExactETHForTokensSupportingFeeOnTransferTokens()`
**ETH 换收费代币**
- 结合 ETH 支持和收费代币处理

##### `swapExactTokensForETHSupportingFeeOnTransferTokens()`
**收费代币换 ETH**
- 处理收费代币到 ETH 的转换

### 内部功能

#### `_addLiquidity()`
**添加流动性的核心逻辑**
1. 检查交易对是否存在，不存在则创建
2. 获取当前储备量
3. 计算最优的代币数量比例
4. 验证数量满足最小要求

#### `_swap()`
**交换的核心逻辑**
1. 遍历交换路径
2. 为每一跳计算输出数量
3. 调用交易对合约执行交换
4. 处理中间代币的路由

#### `_swapSupportingFeeOnTransferTokens()`
**支持收费代币的交换逻辑**
1. 基于实际余额变化而非预计算
2. 适应收费代币的特殊行为
3. 确保交换的准确性

#### `safeTransferETH()`
**安全的 ETH 转账**
- 使用低级调用确保兼容性
- 提供详细的错误信息

## 交换路径机制

### 路径数组
路径数组定义了代币交换的路径：
- `[tokenA, tokenB]`: 直接交换
- `[tokenA, tokenB, tokenC]`: 通过 tokenB 中转
- 每相邻两个代币必须有对应的交易对

### 多跳交换
```solidity
// 示例：USDC → WETH → DAI
address[] memory path = new address[](3);
path[0] = USDC;
path[1] = WETH;
path[2] = DAI;
```

## 价格计算

### 恒定乘积公式
基于 Uniswap V2 的恒定乘积公式：`x * y = k`

### 交换公式
```solidity
// 输出数量计算
amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)

// 输入数量计算
amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1
```

### 手续费
- 每笔交换收取 0.3% 手续费
- 手续费自动分配给流动性提供者

## 安全特性

1. **重入保护**: 所有外部函数都使用 `nonReentrant` 修饰符
2. **截止时间检查**: `ensure` 修饰符防止过期交易
3. **滑点保护**: 最小/最大数量参数保护用户
4. **路径验证**: 验证交换路径的有效性
5. **余额检查**: 确保代币转账成功

## 使用示例

### 添加流动性
```solidity
// 添加 USDC/WETH 流动性
router.addLiquidity(
    USDC,
    WETH,
    1000 * 10**6,  // 1000 USDC
    1 * 10**18,    // 1 WETH
    950 * 10**6,   // 最少 950 USDC
    0.95 * 10**18, // 最少 0.95 WETH
    msg.sender,
    block.timestamp + 300
);
```

### 代币交换
```solidity
// USDC 换 DAI（通过 WETH）
address[] memory path = new address[](3);
path[0] = USDC;
path[1] = WETH;
path[2] = DAI;

router.swapExactTokensForTokens(
    1000 * 10**6,  // 1000 USDC
    990 * 10**18,  // 最少 990 DAI
    path,
    msg.sender,
    block.timestamp + 300
);
```

### ETH 交换
```solidity
// ETH 换 USDC
address[] memory path = new address[](2);
path[0] = WETH;
path[1] = USDC;

router.swapExactETHForTokens{value: 1 ether}(
    1500 * 10**6,  // 最少 1500 USDC
    path,
    msg.sender,
    block.timestamp + 300
);
```

## 注意事项

1. **代币批准**: 使用前需要批准路由合约使用代币
2. **滑点设置**: 根据市场波动性合理设置滑点保护
3. **路径优化**: 选择最优的交换路径以减少滑点
4. **截止时间**: 设置合理的交易截止时间
5. **收费代币**: 对于收费代币，使用专门的支持函数
6. **Gas 优化**: 批量操作可以节省 Gas 费用

## 可升级性

合约使用 OpenZeppelin 的可升级合约模式：
- 通过代理合约部署
- 支持逻辑合约升级
- 保持状态数据不变
- 需要谨慎处理存储布局变更

## 与其他合约的交互

- **AMMFactory**: 创建和查询交易对
- **AMMTokenPair**: 执行具体的交换和流动性操作
- **WETH**: 处理 ETH 和 WETH 之间的转换
- **ERC20**: 标准的代币转账和批准操作

