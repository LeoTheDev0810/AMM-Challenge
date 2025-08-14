import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Signer } from 'ethers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'

import { expandTo18Decimals, mineBlock, encodePrice } from './shared/utilities'
import { pairFixture } from './shared/fixtures'
import { AMMFactory, AMMTokenPair, TestToken } from '../typechain-types'

const MINIMUM_LIQUIDITY = 10n ** 3n

describe('AMMTokenPair', () => {
	let wallet: Signer
	let other: Signer

	beforeEach(async () => {
		;[wallet, other] = await ethers.getSigners()
	})

	let factory: AMMFactory
	let token0: TestToken
	let token1: TestToken
	let pair: AMMTokenPair

	beforeEach(async () => {
		const fixture = await loadFixture(pairFixture)
		factory = fixture.factory
		token0 = fixture.token0
		token1 = fixture.token1
		pair = fixture.pair
	})

	it('mint', async () => {
		const token0Amount = expandTo18Decimals(1)
		const token1Amount = expandTo18Decimals(4)
		await token0.transfer(await pair.getAddress(), token0Amount)
		await token1.transfer(await pair.getAddress(), token1Amount)

		const expectedLiquidity = expandTo18Decimals(2)
		await expect(pair.mint(await wallet.getAddress()))
			.to.emit(pair, 'Transfer')
			.withArgs(ethers.ZeroAddress, ethers.ZeroAddress, MINIMUM_LIQUIDITY)
			.to.emit(pair, 'Transfer')
			.withArgs(
				ethers.ZeroAddress,
				await wallet.getAddress(),
				expectedLiquidity - MINIMUM_LIQUIDITY,
			)
			.to.emit(pair, 'Sync')
			.withArgs(token0Amount, token1Amount)
			.to.emit(pair, 'Mint')
			.withArgs(await wallet.getAddress(), token0Amount, token1Amount)

		expect(await pair.totalSupply()).to.eq(expectedLiquidity)
		expect(await pair.balanceOf(await wallet.getAddress())).to.eq(
			expectedLiquidity - MINIMUM_LIQUIDITY,
		)
		expect(await token0.balanceOf(await pair.getAddress())).to.eq(token0Amount)
		expect(await token1.balanceOf(await pair.getAddress())).to.eq(token1Amount)
		const reserves = await pair.getReserves()
		expect(reserves[0]).to.eq(token0Amount)
		expect(reserves[1]).to.eq(token1Amount)
	})

	async function addLiquidity(
		token0Amount: bigint,
		token1Amount: bigint,
	): Promise<void> {
		await token0.transfer(await pair.getAddress(), token0Amount)
		await token1.transfer(await pair.getAddress(), token1Amount)
		await pair.mint(await wallet.getAddress())
	}

	const swapTestCases: bigint[][] = [
		[1, 5, 10, '1662497915624478906'],
		[1, 10, 5, '453305446940074565'],
		[2, 5, 10, '2851015155847869602'],
		[2, 10, 5, '831248957812239453'],
		[1, 10, 10, '906610893880149131'],
		[1, 100, 100, '987158034397061298'],
		[1, 1000, 1000, '996006981039903216'],
	].map((a) =>
		a.map((n) => (typeof n === 'string' ? BigInt(n) : expandTo18Decimals(n))),
	)

	swapTestCases.forEach((swapTestCase, i) => {
		it(`getInputPrice:${i}`, async () => {
			const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] =
				swapTestCase
			await addLiquidity(token0Amount, token1Amount)
			await token0.transfer(await pair.getAddress(), swapAmount)
			await expect(
				pair.swap(
					0,
					expectedOutputAmount + 1n,
					await wallet.getAddress(),
					'0x',
				),
			).to.be.revertedWith('UniswapV2: K')
			await pair.swap(0, expectedOutputAmount, await wallet.getAddress(), '0x')
		})
	})

	const optimisticTestCases: bigint[][] = [
		['997000000000000000', 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
		['997000000000000000', 10, 5, 1],
		['997000000000000000', 5, 5, 1],
		[1, 5, 5, '1003009027081243732'], // given amountOut, amountIn = ceiling(amountOut / .997)
	].map((a) =>
		a.map((n) => (typeof n === 'string' ? BigInt(n) : expandTo18Decimals(n))),
	)

	optimisticTestCases.forEach((optimisticTestCase, i) => {
		it(`optimistic:${i}`, async () => {
			const [outputAmount, token0Amount, token1Amount, inputAmount] =
				optimisticTestCase
			await addLiquidity(token0Amount, token1Amount)
			await token0.transfer(await pair.getAddress(), inputAmount)
			await expect(
				pair.swap(outputAmount + 1n, 0, await wallet.getAddress(), '0x'),
			).to.be.revertedWith('UniswapV2: K')
			await pair.swap(outputAmount, 0, await wallet.getAddress(), '0x')
		})
	})

	it('swap:token0', async () => {
		const token0Amount = expandTo18Decimals(5)
		const token1Amount = expandTo18Decimals(10)
		await addLiquidity(token0Amount, token1Amount)

		const swapAmount = expandTo18Decimals(1)
		const expectedOutputAmount = BigInt('1662497915624478906')
		await token0.transfer(await pair.getAddress(), swapAmount)
		await expect(
			pair.swap(0, expectedOutputAmount, await wallet.getAddress(), '0x'),
		)
			.to.emit(token1, 'Transfer')
			.withArgs(
				await pair.getAddress(),
				await wallet.getAddress(),
				expectedOutputAmount,
			)
			.to.emit(pair, 'Sync')
			.withArgs(token0Amount + swapAmount, token1Amount - expectedOutputAmount)
			.to.emit(pair, 'Swap')
			.withArgs(
				await wallet.getAddress(),
				swapAmount,
				0,
				0,
				expectedOutputAmount,
				await wallet.getAddress(),
			)

		const reserves = await pair.getReserves()
		expect(reserves[0]).to.eq(token0Amount + swapAmount)
		expect(reserves[1]).to.eq(token1Amount - expectedOutputAmount)
		expect(await token0.balanceOf(await pair.getAddress())).to.eq(
			token0Amount + swapAmount,
		)
		expect(await token1.balanceOf(await pair.getAddress())).to.eq(
			token1Amount - expectedOutputAmount,
		)
		const totalSupplyToken0 = await token0.totalSupply()
		const totalSupplyToken1 = await token1.totalSupply()
		expect(await token0.balanceOf(await wallet.getAddress())).to.eq(
			totalSupplyToken0 - token0Amount - swapAmount,
		)
		expect(await token1.balanceOf(await wallet.getAddress())).to.eq(
			totalSupplyToken1 - token1Amount + expectedOutputAmount,
		)
	})

	it('swap:token1', async () => {
		const token0Amount = expandTo18Decimals(5)
		const token1Amount = expandTo18Decimals(10)
		await addLiquidity(token0Amount, token1Amount)

		const swapAmount = expandTo18Decimals(1)
		const expectedOutputAmount = BigInt('453305446940074565')
		await token1.transfer(await pair.getAddress(), swapAmount)
		await expect(
			pair.swap(expectedOutputAmount, 0, await wallet.getAddress(), '0x'),
		)
			.to.emit(token0, 'Transfer')
			.withArgs(
				await pair.getAddress(),
				await wallet.getAddress(),
				expectedOutputAmount,
			)
			.to.emit(pair, 'Sync')
			.withArgs(token0Amount - expectedOutputAmount, token1Amount + swapAmount)
			.to.emit(pair, 'Swap')
			.withArgs(
				await wallet.getAddress(),
				0,
				swapAmount,
				expectedOutputAmount,
				0,
				await wallet.getAddress(),
			)

		const reserves = await pair.getReserves()
		expect(reserves[0]).to.eq(token0Amount - expectedOutputAmount)
		expect(reserves[1]).to.eq(token1Amount + swapAmount)
		expect(await token0.balanceOf(await pair.getAddress())).to.eq(
			token0Amount - expectedOutputAmount,
		)
		expect(await token1.balanceOf(await pair.getAddress())).to.eq(
			token1Amount + swapAmount,
		)
		const totalSupplyToken0 = await token0.totalSupply()
		const totalSupplyToken1 = await token1.totalSupply()
		expect(await token0.balanceOf(await wallet.getAddress())).to.eq(
			totalSupplyToken0 - token0Amount + expectedOutputAmount,
		)
		expect(await token1.balanceOf(await wallet.getAddress())).to.eq(
			totalSupplyToken1 - token1Amount - swapAmount,
		)
	})

	it('swap:gas', async () => {
		const token0Amount = expandTo18Decimals(5)
		const token1Amount = expandTo18Decimals(10)
		await addLiquidity(token0Amount, token1Amount)

		// ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
		await mineBlock((await ethers.provider.getBlock('latest'))!.timestamp + 1)
		await pair.sync()

		const swapAmount = expandTo18Decimals(1)
		const expectedOutputAmount = BigInt('453305446940074565')
		await token1.transfer(await pair.getAddress(), swapAmount)
		await mineBlock((await ethers.provider.getBlock('latest'))!.timestamp + 1)
		const tx = await pair.swap(
			expectedOutputAmount,
			0,
			await wallet.getAddress(),
			'0x',
		)
		const receipt = await tx.wait()
		expect(receipt!.gasUsed).to.eq(73462)
	})

	it('burn', async () => {
		const token0Amount = expandTo18Decimals(3)
		const token1Amount = expandTo18Decimals(3)
		await addLiquidity(token0Amount, token1Amount)

		const expectedLiquidity = expandTo18Decimals(3)
		await pair.transfer(
			await pair.getAddress(),
			expectedLiquidity - MINIMUM_LIQUIDITY,
		)
		await expect(pair.burn(await wallet.getAddress()))
			.to.emit(pair, 'Transfer')
			.withArgs(
				await pair.getAddress(),
				ethers.ZeroAddress,
				expectedLiquidity - MINIMUM_LIQUIDITY,
			)
			.to.emit(token0, 'Transfer')
			.withArgs(
				await pair.getAddress(),
				await wallet.getAddress(),
				token0Amount - 1000n,
			)
			.to.emit(token1, 'Transfer')
			.withArgs(
				await pair.getAddress(),
				await wallet.getAddress(),
				token1Amount - 1000n,
			)
			.to.emit(pair, 'Sync')
			.withArgs(1000, 1000)
			.to.emit(pair, 'Burn')
			.withArgs(
				await wallet.getAddress(),
				token0Amount - 1000n,
				token1Amount - 1000n,
				await wallet.getAddress(),
			)

		expect(await pair.balanceOf(await wallet.getAddress())).to.eq(0)
		expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
		expect(await token0.balanceOf(await pair.getAddress())).to.eq(1000)
		expect(await token1.balanceOf(await pair.getAddress())).to.eq(1000)
		const totalSupplyToken0 = await token0.totalSupply()
		const totalSupplyToken1 = await token1.totalSupply()
		expect(await token0.balanceOf(await wallet.getAddress())).to.eq(
			totalSupplyToken0 - 1000n,
		)
		expect(await token1.balanceOf(await wallet.getAddress())).to.eq(
			totalSupplyToken1 - 1000n,
		)
	})

	it('price{0,1}CumulativeLast', async () => {
		const token0Amount = expandTo18Decimals(3)
		const token1Amount = expandTo18Decimals(3)
		await addLiquidity(token0Amount, token1Amount)

		const blockTimestamp = (await pair.getReserves())[2]
		await mineBlock(Number(blockTimestamp) + 1)
		await pair.sync()

		const initialPrice = encodePrice(token0Amount, token1Amount)
		expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0])
		expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1])
		expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 1n)

		const swapAmount = expandTo18Decimals(3)
		await token0.transfer(await pair.getAddress(), swapAmount)
		await mineBlock(Number(blockTimestamp) + 10)
		// swap to a new price eagerly instead of syncing
		await pair.swap(0, expandTo18Decimals(1), await wallet.getAddress(), '0x') // make the price nice

		expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0] * 10n)
		expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1] * 10n)
		expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 10n)

		await mineBlock(Number(blockTimestamp) + 20)
		await pair.sync()

		const newPrice = encodePrice(expandTo18Decimals(6), expandTo18Decimals(2))
		expect(await pair.price0CumulativeLast()).to.eq(
			initialPrice[0] * 10n + newPrice[0] * 10n,
		)
		expect(await pair.price1CumulativeLast()).to.eq(
			initialPrice[1] * 10n + newPrice[1] * 10n,
		)
		expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 20n)
	})

	it('feeTo:off', async () => {
		const token0Amount = expandTo18Decimals(1000)
		const token1Amount = expandTo18Decimals(1000)
		await addLiquidity(token0Amount, token1Amount)

		const swapAmount = expandTo18Decimals(1)
		const expectedOutputAmount = BigInt('996006981039903216')
		await token1.transfer(await pair.getAddress(), swapAmount)
		await pair.swap(expectedOutputAmount, 0, await wallet.getAddress(), '0x')

		const expectedLiquidity = expandTo18Decimals(1000)
		await pair.transfer(
			await pair.getAddress(),
			expectedLiquidity - MINIMUM_LIQUIDITY,
		)
		await pair.burn(await wallet.getAddress())
		expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
	})

	it('feeTo:on', async () => {
		await factory.setFeeTo(await other.getAddress())

		const token0Amount = expandTo18Decimals(1000)
		const token1Amount = expandTo18Decimals(1000)
		await addLiquidity(token0Amount, token1Amount)

		const swapAmount = expandTo18Decimals(1)
		const expectedOutputAmount = BigInt('996006981039903216')
		await token1.transfer(await pair.getAddress(), swapAmount)
		await pair.swap(expectedOutputAmount, 0, await wallet.getAddress(), '0x')

		const expectedLiquidity = expandTo18Decimals(1000)
		await pair.transfer(
			await pair.getAddress(),
			expectedLiquidity - MINIMUM_LIQUIDITY,
		)
		await pair.burn(await wallet.getAddress())
		expect(await pair.totalSupply()).to.eq(
			MINIMUM_LIQUIDITY + BigInt('249750499251388'),
		)
		expect(await pair.balanceOf(await other.getAddress())).to.eq(
			BigInt('249750499251388'),
		)

		// using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
		// ...because the initial liquidity amounts were equal
		expect(await token0.balanceOf(await pair.getAddress())).to.eq(
			1000n + BigInt('249501683697445'),
		)
		expect(await token1.balanceOf(await pair.getAddress())).to.eq(
			1000n + BigInt('250000187312969'),
		)
	})
})
