// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.5;

interface IAMMCallee {
    function ammCall(
        address sender,
        uint amount0,
        uint amount1,
        bytes calldata data
    ) external;
}
