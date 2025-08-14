import { ethers } from 'hardhat'
import { BaseContract } from 'ethers'

const PERMIT_TYPEHASH = ethers.keccak256(
  ethers.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

export function expandTo18Decimals(n: number): bigint {
  return BigInt(n) * (10n ** 18n)
}

function getDomainSeparator(name: string, tokenAddress: string) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        ethers.keccak256(ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        ethers.keccak256(ethers.toUtf8Bytes(name)),
        ethers.keccak256(ethers.toUtf8Bytes('1')),
        1,
        tokenAddress
      ]
    )
  )
}

export function getCreate2Address(
  factoryAddress: string,
  [tokenA, tokenB]: [string, string],
  bytecode: string
): string {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    factoryAddress,
    ethers.keccak256(ethers.solidityPacked(['address', 'address'], [token0, token1])),
    ethers.keccak256(bytecode)
  ]
  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join('')}`
  return ethers.getAddress(`0x${ethers.keccak256(sanitizedInputs).slice(-40)}`)
}

export async function getApprovalDigest(
  token: BaseContract & { name(): Promise<string>; getAddress(): Promise<string> },
  approve: {
    owner: string
    spender: string
    value: bigint
  },
  nonce: bigint,
  deadline: bigint
): Promise<string> {
  const name = await token.name()
  const DOMAIN_SEPARATOR = getDomainSeparator(name, await token.getAddress())
  return ethers.keccak256(
    ethers.solidityPacked(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
          )
        )
      ]
    )
  )
}

export async function mineBlock(timestamp: number): Promise<void> {
  await ethers.provider.send('evm_mine', [timestamp])
}

export function encodePrice(reserve0: bigint, reserve1: bigint): [bigint, bigint] {
  return [
    reserve1 * (2n ** 112n) / reserve0, 
    reserve0 * (2n ** 112n) / reserve1
  ]
}
