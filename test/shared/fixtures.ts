import { ethers } from 'hardhat'
import { expandTo18Decimals } from './utilities'
import { AMMFactory, AMMTokenPair, TestToken } from '../../typechain-types'

interface FactoryFixture {
	factory: AMMFactory
}

export async function factoryFixture(): Promise<FactoryFixture> {
	const [wallet] = await ethers.getSigners()

	const AMMFactory = await ethers.getContractFactory('AMMFactory')
	const factory = (await AMMFactory.deploy({
		from: wallet.address,
	})) as AMMFactory
	await factory.waitForDeployment()

	return { factory }
}

interface PairFixture extends FactoryFixture {
	token0: TestToken
	token1: TestToken
	pair: AMMTokenPair
}

export async function pairFixture(): Promise<PairFixture> {
	const [wallet] = await ethers.getSigners()
	const { factory } = await factoryFixture()

	const TestToken = await ethers.getContractFactory('TestToken')
	const tokenA = (await TestToken.deploy(
		'Token A',
		'TKA',
		expandTo18Decimals(10000),
	)) as TestToken
	const tokenB = (await TestToken.deploy(
		'Token B',
		'TKB',
		expandTo18Decimals(10000),
	)) as TestToken
	await tokenA.waitForDeployment()
	await tokenB.waitForDeployment()

	await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress())
	const pairAddress = await factory.getPair(
		await tokenA.getAddress(),
		await tokenB.getAddress(),
	)

	const AMMTokenPair = await ethers.getContractFactory('AMMTokenPair')
	const pair = AMMTokenPair.attach(pairAddress) as AMMTokenPair

	const token0Address = await pair.token0()
	const token0 = (await tokenA.getAddress()) === token0Address ? tokenA : tokenB
	const token1 = (await tokenA.getAddress()) === token0Address ? tokenB : tokenA

	return { factory, token0, token1, pair }
}
