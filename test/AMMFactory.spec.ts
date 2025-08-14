import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Signer } from 'ethers'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'

import { getCreate2Address } from './shared/utilities'
import { factoryFixture } from './shared/fixtures'
import { AMMFactory } from '../typechain-types'

const TEST_ADDRESSES: [string, string] = [
	'0x1000000000000000000000000000000000000000',
	'0x2000000000000000000000000000000000000000',
]

describe('AMMFactory', () => {
	let wallet: Signer
	let other: Signer

	beforeEach(async () => {
		;[wallet, other] = await ethers.getSigners()
	})

	let factory: AMMFactory
	beforeEach(async () => {
		const fixture = await loadFixture(factoryFixture)
		factory = fixture.factory
	})

	it('feeTo, feeToSetter, allPairsLength', async () => {
		expect(await factory.feeTo()).to.eq(ethers.ZeroAddress)
		expect(await factory.feeToSetter()).to.eq(await wallet.getAddress())
		expect(await factory.allPairsLength()).to.eq(0)
	})

	async function createPair(tokens: [string, string]): Promise<void> {
		const AMMTokenPair = await ethers.getContractFactory('AMMTokenPair')
		const bytecode = AMMTokenPair.bytecode
		const create2Address = getCreate2Address(
			await factory.getAddress(),
			tokens,
			bytecode,
		)

		await expect(factory.createPair(...tokens))
			.to.emit(factory, 'PairCreated')
			.withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, 1n)

		await expect(factory.createPair(...tokens)).to.be.reverted // AMMFactory: PAIR_EXISTS
		await expect(
			factory.createPair(...(tokens.slice().reverse() as [string, string])),
		).to.be.reverted // AMMFactory: PAIR_EXISTS
		expect(await factory.getPair(...tokens)).to.eq(create2Address)
		expect(
			await factory.getPair(...(tokens.slice().reverse() as [string, string])),
		).to.eq(create2Address)
		expect(await factory.allPairs(0)).to.eq(create2Address)
		expect(await factory.allPairsLength()).to.eq(1)

		const pair = await ethers.getContractAt('AMMTokenPair', create2Address)
		expect(await pair.factory()).to.eq(await factory.getAddress())
		expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
		expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
	}

	it('createPair', async () => {
		await createPair(TEST_ADDRESSES)
	})

	it('createPair:reverse', async () => {
		await createPair(TEST_ADDRESSES.slice().reverse() as [string, string])
	})

	it('createPair:gas', async () => {
		const tx = await factory.createPair(...TEST_ADDRESSES)
		const receipt = await tx.wait()
		expect(receipt!.gasUsed).to.eq(2512920)
	})

	it('setFeeTo', async () => {
		await expect(
			factory.connect(other).setFeeTo(await other.getAddress()),
		).to.be.revertedWith('AMMFactory: FORBIDDEN')
		await factory.setFeeTo(await wallet.getAddress())
		expect(await factory.feeTo()).to.eq(await wallet.getAddress())
	})

	it('setFeeToSetter', async () => {
		await expect(
			factory.connect(other).setFeeToSetter(await other.getAddress()),
		).to.be.revertedWith('AMMFactory: FORBIDDEN')
		await factory.setFeeToSetter(await other.getAddress())
		expect(await factory.feeToSetter()).to.eq(await other.getAddress())
		await expect(
			factory.setFeeToSetter(await wallet.getAddress()),
		).to.be.revertedWith('AMMFactory: FORBIDDEN')
	})
})
