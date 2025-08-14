// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.5;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import "./interfaces/IAMMFactory.sol";
import "./interfaces/IAMMTokenPair.sol";
import "./interfaces/IAMMRouter01.sol";
import "./interfaces/IWETH.sol";
import "./libraries/AMMLibrary.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract AMMRouter01 is
    IAMMRouter01,
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20 for IERC20;
    //布署时定义的常量工厂地址和weth地址
    address private _factory;
    address private _WETH;

    //修饰符:确保最后期限大于当前时间
    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "AMMRouter: EXPIRED");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev 初始化函数，替代构造函数
     * @param _factoryAddr 工厂地址
     * @param _WETHAddr WETH地址
     */
    function initialize(
        address _factoryAddr,
        address _WETHAddr
    ) external initializer {
        __ReentrancyGuard_init();
        __Ownable_init(msg.sender);
        _factory = _factoryAddr;
        _WETH = _WETHAddr;
    }

    /**
     * @dev 实现接口要求的factory()函数
     */
    function factory() external view override returns (address) {
        return _factory;
    }

    /**
     * @dev 实现接口要求的WETH()函数
     */
    function WETH() external view override returns (address) {
        return _WETH;
    }

    //退款方法
    receive() external payable {
        //断言调用者为weth合约地址
        assert(msg.sender == _WETH); // only accept ETH via fallback from the WETH contract
    }

    function safeTransferETH(address to, uint256 value) internal {
        // solium-disable-next-line
        (bool success, ) = to.call{value: value}("");
        require(success, "TransferHelper: ETH_TRANSFER_FAILED");
    }

    // **** ADD LIQUIDITY ****
    /**
     * @dev 添加流动性的私有方法
     * @param tokenA tokenA地址
     * @param tokenB tokenB地址
     * @param amountADesired 期望数量A
     * @param amountBDesired 期望数量B
     * @param amountAMin 最小数量A
     * @param amountBMin 最小数量B
     * @return amountA   数量A
     * @return amountB   数量B
     */
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) private returns (uint256 amountA, uint256 amountB) {
        // 如果配对不存在，则创建配对
        if (IAMMFactory(_factory).getPair(tokenA, tokenB) == address(0)) {
            IAMMFactory(_factory).createPair(tokenA, tokenB);
        }
        //获取储备量reserveA, reserveB
        (uint256 reserveA, uint256 reserveB) = AMMLibrary.getReserves(
            _factory,
            tokenA,
            tokenB
        );
        //如果储备量A和储备量B都等于0
        if (reserveA == 0 && reserveB == 0) {
            //数量A,数量B = 期望数量A,期望数量B
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            //最优数量B = 期望数量A * 储备量B / 储备量A
            uint256 amountBOptimal = AMMLibrary.quote(
                amountADesired,
                reserveA,
                reserveB
            );
            //如果最优数量B <= 期望数量B
            if (amountBOptimal <= amountBDesired) {
                //确认最优数量B >= 最小数量B
                require(
                    amountBOptimal >= amountBMin,
                    "AMMRouter: INSUFFICIENT_B_AMOUNT"
                );
                //数量A,数量B = 期望数量A,最优数量B
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                //最优数量A = 期望数量B * 储备量A / 储备量B
                uint256 amountAOptimal = AMMLibrary.quote(
                    amountBDesired,
                    reserveB,
                    reserveA
                );
                //断言最优数量A <= 期望数量A
                assert(amountAOptimal <= amountADesired);
                //确认最优数量A >= 最小数量A
                require(
                    amountAOptimal >= amountAMin,
                    "AMMRouter: INSUFFICIENT_A_AMOUNT"
                );
                //数量A,数量B = 最优数量A,期望数量B
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    /**
     * @dev 添加流动性
     * @notice 将ERC-20⇄ERC-20对的流动性添加到池中。
     * @param tokenA tokenA地址
     * @param tokenB tokenB地址
     * @param amountADesired 期望数量A
     * @param amountBDesired 期望数量B
     * @param amountAMin 最小数量A
     * @param amountBMin 最小数量B
     * @param to to地址
     * @param deadline 最后期限
     * @return amountA   数量A
     * @return amountB   数量B
     * @return liquidity   流动性数量
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        ensure(deadline)
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        //获取数量A,数量B
        (amountA, amountB) = _addLiquidity(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin
        );
        //根据tokenA,tokenB获取`pair合约`地址
        address pair = AMMLibrary.pairFor(_factory, tokenA, tokenB);
        //将数量为amountA的tokenA从msg.sender账户中安全发送到pair合约地址
        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        //将数量为amountB的tokenB从msg.sender账户中安全发送到pair合约地址
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        //流动性数量 = pair合约的铸造方法铸造给to地址的返回值
        liquidity = IAMMTokenPair(pair).mint(to);
    }

    /**
     * @dev 添加ETH流动性的私有方法
     * @notice 将ERC-20⇄WETH对的流动性添加到池中并用ETH包装。
     * @param token token地址
     * @param amountTokenDesired 期望token数量
     * @param amountTokenMin 最小token数量
     * @param amountETHMin 最小ETH数量
     * @param to to地址
     * @param deadline 最后期限
     * @return amountToken   token数量
     * @return amountETH   ETH数量
     * @return liquidity   流动性数量
     */
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        ensure(deadline)
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        //获取token数量,ETH数量
        (amountToken, amountETH) = _addLiquidity(
            token,
            _WETH, // 修复: WETH -> _WETH
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountETHMin
        );
        //根据token,WETH获取`pair合约`地址
        address pair = AMMLibrary.pairFor(_factory, token, _WETH); // 修复: factory -> _factory, WETH -> _WETH
        //将数量为amountToken的token从msg.sender账户中安全发送到pair合约地址
        IERC20(token).safeTransferFrom(msg.sender, pair, amountToken);
        //向WETH合约存款amountETH数量的主币
        IWETH(_WETH).deposit{value: amountETH}(); // 修复: WETH -> _WETH
        //断言向pair地址发送amountETH数量的WETH成功
        assert(IWETH(_WETH).transfer(pair, amountETH)); // 修复: WETH -> _WETH
        //流动性数量 = pair合约的铸造方法铸造给to地址的返回值
        liquidity = IAMMTokenPair(pair).mint(to);
        // 如果还有剩余ETH，则退还
        if (msg.value > amountETH)
            safeTransferETH(msg.sender, msg.value - amountETH); // 修复: WETH -> _WETH
    }

    // **** REMOVE LIQUIDITY ****
    /**
     * @dev 移除流动性
     * @notice 从ERC-20⇄ERC-20池中删除流动性。
     * @param tokenA tokenA地址
     * @param tokenB tokenB地址
     * @param liquidity 流动性数量
     * @param amountAMin 最小数量A
     * @param amountBMin 最小数量B
     * @param to to地址
     * @param deadline 最后期限
     * @return amountA   数量A
     * @return amountB   数量B
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        //根据tokenA,tokenB获取`pair合约`地址
        address pair = AMMLibrary.pairFor(_factory, tokenA, tokenB);
        //将流动性数量的流动性token从用户发送到pair地址(需要用户提前批准)
        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        //pair合约销毁流动性token,并发送对应的tokenA,tokenB到to地址
        (uint256 amount0, uint256 amount1) = IAMMTokenPair(pair).burn(to);
        //排序tokenA,tokenB
        (address token0, ) = AMMLibrary.sortTokens(tokenA, tokenB);
        //根据排序结果分配数量
        (amountA, amountB) = tokenA == token0
            ? (amount0, amount1)
            : (amount1, amount0);
        //确认数量A >= 最小数量A
        require(amountA >= amountAMin, "AMMLibrary: INSUFFICIENT_A_AMOUNT");
        //确认数量B >= 最小数量B
        require(amountB >= amountBMin, "AMMLibrary: INSUFFICIENT_B_AMOUNT");
    }

    /**
     * @dev 移除ETH流动性的私有方法
     * @notice 从ERC-20⇄WETH池中删除流动性并接收ETH。
     * @param token token地址
     * @param liquidity 流动性数量
     * @param amountTokenMin 最小token数量
     * @param amountETHMin 最小ETH数量
     * @param to to地址
     * @param deadline 最后期限
     * @return amountToken   token数量
     * @return amountETH   ETH数量
     */
    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        //移除token/WETH流动性,获取token数量和ETH数量
        (amountToken, amountETH) = removeLiquidity(
            token,
            _WETH, // 修复: WETH -> _WETH
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
        //将token数量的token安全发送给to地址
        IERC20(token).safeTransfer(to, amountToken);
        //从WETH合约提款ETH数量的WETH
        IWETH(_WETH).withdraw(amountETH); // 修复: WETH -> _WETH
        //将ETH数量的ETH发送给to地址
        safeTransferETH(to, amountETH);
    }

    /**
     * @dev 带签名移除流动性
     * @notice 使用许可证从ERC-20⇄ERC-20池中删除流动性。
     * @param tokenA tokenA地址
     * @param tokenB tokenB地址
     * @param liquidity 流动性数量
     * @param amountAMin 最小数量A
     * @param amountBMin 最小数量B
     * @param to to地址
     * @param deadline 最后期限
     * @param approveMax 全部批准
     * @param v v
     * @param r r
     * @param s s
     * @return amountA   数量A
     * @return amountB   数量B
     */
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 amountA, uint256 amountB) {
        //根据tokenA,tokenB获取`pair合约`地址
        address pair = AMMLibrary.pairFor(_factory, tokenA, tokenB);
        //如果全部批准,value值等于uint256最大值,否则等于流动性数量
        uint256 value = approveMax ? type(uint256).max : liquidity;
        //调用pair合约的许可方法
        IERC20Permit(pair).permit(
            msg.sender,
            address(this),
            value,
            deadline,
            v,
            r,
            s
        );
        //移除流动性
        (amountA, amountB) = removeLiquidity(
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin,
            to,
            deadline
        );
    }

    /**
     * @dev 带签名移除ETH流动性的私有方法
     * @notice 使用许可证从ERC-20⇄WETTH池中删除流动性并接收ETH。
     * @param token token地址
     * @param liquidity 流动性数量
     * @param amountTokenMin 最小token数量
     * @param amountETHMin 最小ETH数量
     * @param to to地址
     * @param deadline 最后期限
     * @param approveMax 全部批准
     * @param v v
     * @param r r
     * @param s s
     * @return amountToken   token数量
     * @return amountETH   ETH数量
     */
    function removeLiquidityETHWithPermit(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 amountToken, uint256 amountETH) {
        //根据token,WETH获取`pair合约`地址
        address pair = AMMLibrary.pairFor(_factory, token, _WETH); // 修复: factory -> _factory, WETH -> _WETH
        //如果全部批准,value值等于uint256最大值,否则等于流动性数量
        uint256 value = approveMax ? type(uint256).max : liquidity;
        //调用pair合约的许可方法
        IERC20Permit(pair).permit(
            msg.sender,
            address(this),
            value,
            deadline,
            v,
            r,
            s
        );
        //移除ETH流动性的私有方法
        (amountToken, amountETH) = removeLiquidityETH(
            token,
            liquidity,
            amountTokenMin,
            amountETHMin,
            to,
            deadline
        );
    }

    // **** SWAP ****
    // 要求初始金额已经发送到第一对
    /**
     * @dev 私有交换方法
     * @param amounts 数额数组
     * @param path 路径数组
     * @param _to to地址
     */
    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) private {
        //遍历路径数组
        for (uint256 i; i < path.length - 1; i++) {
            //(输入token地址,输出token地址) = (当前路径地址,下一个路径地址)
            (address input, address output) = (path[i], path[i + 1]);
            //排序token地址
            (address token0, ) = AMMLibrary.sortTokens(input, output);
            //输出数额 = amounts数组下一个数额
            uint256 amountOut = amounts[i + 1];
            //(输出数额0,输出数额1) = 输入token地址==token0地址 ? (0,输出数额) : (输出数额,0)
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            //to地址 = i < 路径数组长度-2 ? 下一个路径的pair合约地址 : _to地址
            address to = i < path.length - 2
                ? AMMLibrary.pairFor(_factory, output, path[i + 2])
                : _to;
            //调用当前路径的pair合约的交换方法
            IAMMTokenPair(AMMLibrary.pairFor(_factory, input, output)).swap(
                amount0Out,
                amount1Out,
                to,
                new bytes(0)
            );
        }
    }

    /**
     * @dev 根据精确的token交换尽量多的token
     * @param amountIn 精确输入数额
     * @param amountOutMin 最小输出数额
     * @param path 路径数组
     * @param to to地址
     * @param deadline 最后期限
     * @return amounts 数额数组
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        //通过路径数组获取输出数额数组
        amounts = AMMLibrary.getAmountsOut(_factory, amountIn, path);
        //确认数额数组最后一个元素(输出数额) >= 最小输出数额
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            "AMMLibrary: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        //将数额数组第一个元素(输入数额)的第一个路径token从msg.sender账户中安全发送到第一个路径的pair合约
        IERC20(path[0]).safeTransferFrom(
            msg.sender,
            AMMLibrary.pairFor(_factory, path[0], path[1]),
            amounts[0]
        );
        //私有交换
        _swap(amounts, path, to);
    }

    /**
     * @dev 使用尽量少的token交换精确的token
     * @param amountOut 精确输出数额
     * @param amountInMax 最大输入数额
     * @param path 路径数组
     * @param to to地址
     * @param deadline 最后期限
     * @return amounts 数额数组
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        //通过路径数组获取输入数额数组
        amounts = AMMLibrary.getAmountsIn(_factory, amountOut, path);
        //确认数额数组第一个元素(输入数额) <= 最大输入数额
        require(
            amounts[0] <= amountInMax,
            "AMMLibrary: EXCESSIVE_INPUT_AMOUNT"
        );
        //将数额数组第一个元素(输入数额)的第一个路径token从msg.sender账户中安全发送到第一个路径的pair合约
        IERC20(path[0]).safeTransferFrom(
            msg.sender,
            AMMLibrary.pairFor(_factory, path[0], path[1]),
            amounts[0]
        );
        //私有交换
        _swap(amounts, path, to);
    }

    /**
     * @dev 根据精确的ETH交换尽量多的token
     * @param amountOutMin 最小输出数额
     * @param path 路径数组
     * @param to to地址
     * @param deadline 最后期限
     * @return amounts 数额数组
     */
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        //确认路径数组第一个地址为WETH地址
        require(path[0] == _WETH, "AMMLibrary: INVALID_PATH");
        //通过路径数组获取输出数额数组
        amounts = AMMLibrary.getAmountsOut(_factory, msg.value, path);
        //确认数额数组最后一个元素(输出数额) >= 最小输出数额
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            "AMMLibrary: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        //向WETH合约存款msg.value数量的主币
        IWETH(_WETH).deposit{value: amounts[0]}();
        //断言向第一个路径的pair合约地址发送amounts[0]数量的WETH成功
        assert(
            IWETH(_WETH).transfer(
                AMMLibrary.pairFor(_factory, path[0], path[1]),
                amounts[0]
            )
        );
        //私有交换
        _swap(amounts, path, to);
    }

    /**
     * @dev 使用尽量少的token交换精确的ETH
     * @param amountOut 精确输出数额
     * @param amountInMax 最大输入数额
     * @param path 路径数组
     * @param to to地址
     * @param deadline 最后期限
     * @return amounts 数额数组
     */
    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        //确认路径数组最后一个地址为WETH地址
        require(path[path.length - 1] == _WETH, "AMMLibrary: INVALID_PATH");
        //通过路径数组获取输入数额数组
        amounts = AMMLibrary.getAmountsIn(_factory, amountOut, path);
        //确认数额数组第一个元素(输入数额) <= 最大输入数额
        require(
            amounts[0] <= amountInMax,
            "AMMLibrary: EXCESSIVE_INPUT_AMOUNT"
        );
        //将数额数组第一个元素(输入数额)的第一个路径token从msg.sender账户中安全发送到第一个路径的pair合约
        IERC20(path[0]).safeTransferFrom(
            msg.sender,
            AMMLibrary.pairFor(_factory, path[0], path[1]),
            amounts[0]
        );
        //私有交换
        _swap(amounts, path, address(this));
        //从WETH合约提款amounts数组最后一个元素(输出数额)数量的WETH
        IWETH(_WETH).withdraw(amounts[amounts.length - 1]);
        //将amounts数组最后一个元素(输出数额)数量的ETH发送给to地址
        safeTransferETH(to, amounts[amounts.length - 1]);
    }

    /**
     * @dev 根据精确的token交换尽量多的ETH
     * @param amountIn 精确输入数额
     * @param amountOutMin 最小输出数额
     * @param path 路径数组
     * @param to to地址
     * @param deadline 最后期限
     * @return amounts 数额数组
     */
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        //确认路径数组最后一个地址为WETH地址
        require(path[path.length - 1] == _WETH, "AMMLibrary: INVALID_PATH");
        //通过路径数组获取输出数额数组
        amounts = AMMLibrary.getAmountsOut(_factory, amountIn, path);
        //确认数额数组最后一个元素(输出数额) >= 最小输出数额
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            "AMMLibrary: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        //将数额数组第一个元素(输入数额)的第一个路径token从msg.sender账户中安全发送到第一个路径的pair合约
        IERC20(path[0]).safeTransferFrom(
            msg.sender,
            AMMLibrary.pairFor(_factory, path[0], path[1]),
            amounts[0]
        );
        //私有交换
        _swap(amounts, path, address(this));
        //从WETH合约提款amounts数组最后一个元素(输出数额)数量的WETH
        IWETH(_WETH).withdraw(amounts[amounts.length - 1]);
        //将amounts数组最后一个元素(输出数额)数量的ETH发送给to地址
        safeTransferETH(to, amounts[amounts.length - 1]);
    }

    /**
     * @dev 根据精确的ETH交换尽量少的token
     * @param amountOut 精确输出数额
     * @param path 路径数组
     * @param to to地址
     * @param deadline 最后期限
     * @return amounts 数额数组
     */
    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        //确认路径数组第一个地址为WETH地址
        require(path[0] == _WETH, "AMMLibrary: INVALID_PATH");
        //通过路径数组获取输入数额数组
        amounts = AMMLibrary.getAmountsIn(_factory, amountOut, path);
        //确认数额数组第一个元素(输入数额) <= msg.value
        require(amounts[0] <= msg.value, "AMMLibrary: EXCESSIVE_INPUT_AMOUNT");
        //向WETH合约存款amounts[0]数量的主币
        IWETH(_WETH).deposit{value: amounts[0]}();
        //断言向第一个路径的pair合约地址发送amounts[0]数量的WETH成功
        assert(
            IWETH(_WETH).transfer(
                AMMLibrary.pairFor(_factory, path[0], path[1]),
                amounts[0]
            )
        );
        //私有交换
        _swap(amounts, path, to);
        // 如果还有剩余ETH，则退还
        if (msg.value > amounts[0])
            safeTransferETH(msg.sender, msg.value - amounts[0]);
    }

    // **** LIBRARY FUNCTIONS ****
    /**
     * @dev 对价
     * @param amountA 数额A
     * @param reserveA 储备量A
     * @param reserveB 储备量B
     * @return amountB   数额B
     */
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure returns (uint256 amountB) {
        return AMMLibrary.quote(amountA, reserveA, reserveB);
    }

    /**
     * @dev 获取输出数额
     * @param amountIn 输入数额
     * @param reserveIn 输入储备量
     * @param reserveOut 输出储备量
     * @return amountOut   输出数额
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        return AMMLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    /**
     * @dev 获取输入数额
     * @param amountOut 输出数额
     * @param reserveIn 输入储备量
     * @param reserveOut 输出储备量
     * @return amountIn   输入数额
     */
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountIn) {
        return AMMLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    /**
     * @dev 获取输出数额数组
     * @param amountIn 输入数额
     * @param path 路径数组
     * @return amounts   输出数额数组
     */
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) public view returns (uint256[] memory amounts) {
        return AMMLibrary.getAmountsOut(_factory, amountIn, path);
    }

    /**
     * @dev 获取输入数额数组
     * @param amountOut 输出数额
     * @param path 路径数组
     * @return amounts   输入数额数组
     */
    function getAmountsIn(
        uint256 amountOut,
        address[] calldata path
    ) public view returns (uint256[] memory amounts) {
        return AMMLibrary.getAmountsIn(_factory, amountOut, path);
    }
}
