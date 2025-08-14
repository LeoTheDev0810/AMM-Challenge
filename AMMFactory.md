# AMMFactory 工厂合约

AMMFactory 是一个可升级的 AMM 工厂合约，负责创建和管理交易对合约。该合约继承了 OpenZeppelin 的可升级合约模式，支持初始化、所有权管理和重入保护。

## 合约特性

- **可升级性**: 使用 OpenZeppelin 的可升级合约模式
- **安全性**: 集成重入保护和所有权控制
- **CREATE2 部署**: 使用确定性地址部署交易对合约
- **费用管理**: 支持协议费用收取和管理

## 状态变量

### 核心变量
- `feeTo`: 协议费用收取地址
- `feeToSetter`: 费用设置权限控制地址
- `getPair`: 双向映射，存储代币对到交易对合约地址的映射
- `allPairs`: 存储所有已创建交易对合约地址的数组
- `INIT_CODE_PAIR_HASH`: 交易对合约字节码的哈希值常量

## 主要功能

### 初始化

#### `initialize(address _feeToSetter)`
合约初始化函数，替代传统构造函数：
- 初始化所有权管理
- 初始化重入保护
- 设置费用权限控制地址

### 交易对管理

#### `createPair(address tokenA, address tokenB)`
创建新的交易对合约：

**参数:**
- `tokenA`: 第一个代币地址
- `tokenB`: 第二个代币地址

**返回值:**
- `pair`: 新创建的交易对合约地址

**执行流程:**
1. 验证 tokenA 不等于 tokenB
2. 对代币地址进行排序，确保 token0 < token1
3. 验证 token0 不为零地址
4. 检查交易对是否已存在
5. 获取 AMMTokenPair 合约的创建字节码
6. 使用 token0 和 token1 生成盐值
7. 通过 CREATE2 部署新的交易对合约
8. 初始化交易对合约
9. 更新双向映射关系
10. 将新交易对添加到数组
11. 触发 PairCreated 事件

**安全检查:**
- 防止相同代币创建交易对
- 防止零地址参与
- 防止重复创建相同交易对
- 重入保护

#### `allPairsLength()`
查询已创建交易对的总数量

**返回值:**
- `uint`: 交易对数量

### 费用管理

#### `setFeeTo(address _feeTo)`
设置协议费用收取地址

**参数:**
- `_feeTo`: 新的费用收取地址

**权限要求:**
- 只有 feeToSetter 可以调用

#### `setFeeToSetter(address _feeToSetter)`
设置费用权限控制地址

**参数:**
- `_feeToSetter`: 新的费用权限控制地址

**权限要求:**
- 只有当前 feeToSetter 可以调用

## 事件

### `PairCreated(address indexed token0, address indexed token1, address pair, uint)`
当新交易对创建时触发：
- `token0`: 排序后的第一个代币地址
- `token1`: 排序后的第二个代币地址
- `pair`: 新创建的交易对合约地址
- `uint`: 当前交易对总数

## 安全特性

### 访问控制
- 使用 OpenZeppelin 的 OwnableUpgradeable 进行所有权管理
- 费用相关操作需要特定权限

### 重入保护
- 继承 ReentrancyGuardUpgradeable
- createPair 函数使用 nonReentrant 修饰符

### 地址验证
- 防止零地址参与交易对创建
- 防止相同代币创建交易对
- 防止重复创建相同交易对

## 可升级性

### 初始化模式
- 使用 `_disableInitializers()` 防止实现合约被初始化
- 通过代理合约调用 `initialize` 函数进行初始化

### 存储布局
- 遵循 OpenZeppelin 可升级合约的存储布局规范
- 确保升级时存储兼容性

## 使用示例

```solidity
// 部署工厂合约
AMMFactory factory = new AMMFactory();

// 初始化工厂合约
factory.initialize(feeToSetterAddress);

// 创建交易对
address pair = factory.createPair(tokenA, tokenB);

// 查询交易对地址
address pairAddress = factory.getPair(tokenA, tokenB);

// 查询交易对总数
uint totalPairs = factory.allPairsLength();
```

## 注意事项

1. **初始化**: 合约部署后必须调用 `initialize` 函数
2. **权限管理**: 费用相关操作需要适当的权限控制
3. **升级安全**: 升级时需要确保存储布局兼容性
4. **CREATE2**: 交易对地址是确定性的，可以预先计算
5. **事件监听**: 建议监听 PairCreated 事件来跟踪新交易对的创建