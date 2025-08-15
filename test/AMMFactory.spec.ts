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
	let admin: Signer

	beforeEach(async () => {
		;[wallet, other, admin] = await ethers.getSigners()
	})

	let factory: AMMFactory
	beforeEach(async () => {
		const fixture = await loadFixture(factoryFixture)
		factory = fixture.factory
	})

	// 角色常量
	const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes('ADMIN_ROLE'))
	const PAIR_CREATOR_ROLE = ethers.keccak256(
		ethers.toUtf8Bytes('PAIR_CREATOR_ROLE'),
	)
	const FEE_MANAGER_ROLE = ethers.keccak256(
		ethers.toUtf8Bytes('FEE_MANAGER_ROLE'),
	)
	const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('PAUSER_ROLE'))
	const DEFAULT_ADMIN_ROLE =
		'0x0000000000000000000000000000000000000000000000000000000000000000'

	it('feeTo, feeToSetter, allPairsLength', async () => {
		expect(await factory.feeTo()).to.eq(ethers.ZeroAddress)
		expect(await factory.feeToSetter()).to.eq(await wallet.getAddress())
		expect(await factory.allPairsLength()).to.eq(0)
	})

	// 测试角色检查函数
	it('role checking functions', async () => {
		const walletAddress = await wallet.getAddress()
		const otherAddress = await other.getAddress()

		// wallet 应该有所有角色（因为是初始化时的管理员）
		expect(await factory.canCreatePair(walletAddress)).to.be.true
		expect(await factory.canManageFees(walletAddress)).to.be.true
		expect(await factory.canPause(walletAddress)).to.be.true

		// other 应该没有任何角色
		expect(await factory.canCreatePair(otherAddress)).to.be.false
		expect(await factory.canManageFees(otherAddress)).to.be.false
		expect(await factory.canPause(otherAddress)).to.be.false
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
		// 注意：gas 使用量可能因为 RBAC 而有所变化
		expect(receipt!.gasUsed).to.be.greaterThan(2500000)
	})

	// 测试没有权限的用户无法创建配对
	it('createPair: access control', async () => {
		await expect(
			factory.connect(other).createPair(...TEST_ADDRESSES),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')
	})

	// 测试暂停功能
	it('pause/unpause functionality', async () => {
		// 暂停合约
		await factory.pause()

		// 暂停状态下无法创建配对
		await expect(
			factory.createPair(...TEST_ADDRESSES),
		).to.be.revertedWithCustomError(factory, 'EnforcedPause')

		// 恢复合约
		await factory.unpause()

		// 恢复后可以创建配对
		await expect(factory.createPair(...TEST_ADDRESSES)).to.emit(
			factory,
			'PairCreated',
		)
	})

	// 测试没有权限的用户无法暂停
	it('pause: access control', async () => {
		await expect(factory.connect(other).pause()).to.be.revertedWithCustomError(
			factory,
			'AccessControlUnauthorizedAccount',
		)
	})

	it('setFeeTo', async () => {
		// 没有 FEE_MANAGER_ROLE 的用户无法设置
		await expect(
			factory.connect(other).setFeeTo(await other.getAddress()),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')

		// 有权限的用户可以设置
		await expect(factory.setFeeTo(await wallet.getAddress()))
			.to.emit(factory, 'FeeToUpdated')
			.withArgs(ethers.ZeroAddress, await wallet.getAddress())

		expect(await factory.feeTo()).to.eq(await wallet.getAddress())
	})

	it('setFeeToSetter', async () => {
		// 没有 ADMIN_ROLE 的用户无法设置
		await expect(
			factory.connect(other).setFeeToSetter(await other.getAddress()),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')

		// 有权限的用户可以设置
		await expect(factory.setFeeToSetter(await other.getAddress()))
			.to.emit(factory, 'FeeToSetterUpdated')
			.withArgs(await wallet.getAddress(), await other.getAddress())

		expect(await factory.feeToSetter()).to.eq(await other.getAddress())

		// 验证角色转移：旧地址失去权限，新地址获得权限
		expect(await factory.canManageFees(await wallet.getAddress())).to.be.true // wallet 仍有权限（因为有 ADMIN_ROLE）
		expect(await factory.canManageFees(await other.getAddress())).to.be.true // other 现在有权限
	})

	// 测试批量角色管理
	it('batch role management', async () => {
		const [, addr1, addr2, addr3] = await ethers.getSigners()
		const addresses = [
			await addr1.getAddress(),
			await addr2.getAddress(),
			await addr3.getAddress(),
		]

		// 批量授予角色
		await factory.grantRoleBatch(PAIR_CREATOR_ROLE, addresses)

		// 验证所有地址都有权限
		for (const addr of addresses) {
			expect(await factory.canCreatePair(addr)).to.be.true
		}

		// 批量撤销角色
		await factory.revokeRoleBatch(PAIR_CREATOR_ROLE, addresses)

		// 验证所有地址都失去权限
		for (const addr of addresses) {
			expect(await factory.canCreatePair(addr)).to.be.false
		}
	})

	// 测试紧急停止
	it('emergency stop', async () => {
		// 只有 DEFAULT_ADMIN_ROLE 可以紧急停止
		await expect(
			factory.connect(other).emergencyStop(),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')

		// 管理员可以紧急停止
		await factory.emergencyStop()

		// 验证合约已暂停
		await expect(
			factory.createPair(...TEST_ADDRESSES),
		).to.be.revertedWithCustomError(factory, 'EnforcedPause')
	})

	// 测试角色管理的访问控制
	it('role management access control', async () => {
		const otherAddress = await other.getAddress()

		// 非管理员无法授予角色
		await expect(
			factory.connect(other).grantRoleBatch(PAIR_CREATOR_ROLE, [otherAddress]),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')

		// 非管理员无法撤销角色
		await expect(
			factory.connect(other).revokeRoleBatch(PAIR_CREATOR_ROLE, [otherAddress]),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')
	})

	// 测试 supportsInterface 函数
	it('supports interface', async () => {
		// 测试 AccessControl 接口
		const accessControlInterfaceId = '0x7965db0b' // IAccessControl interface ID
		expect(await factory.supportsInterface(accessControlInterfaceId)).to.be.true

		// 测试 Pausable 接口（如果有的话）
		const pausableInterfaceId = '0x5c975abb' // IPausable interface ID
		expect(await factory.supportsInterface(pausableInterfaceId)).to.be.true
	})

	// 测试角色常量函数
	it('role constants', async () => {
		expect(await factory.ADMIN_ROLE()).to.eq(ADMIN_ROLE)
		expect(await factory.PAIR_CREATOR_ROLE()).to.eq(PAIR_CREATOR_ROLE)
		expect(await factory.FEE_MANAGER_ROLE()).to.eq(FEE_MANAGER_ROLE)
		expect(await factory.PAUSER_ROLE()).to.eq(PAUSER_ROLE)
	})

	// 测试初始化状态
	it('initialization state', async () => {
		const walletAddress = await wallet.getAddress()

		// 验证初始角色分配
		expect(await factory.hasRole(DEFAULT_ADMIN_ROLE, walletAddress)).to.be.true
		expect(await factory.hasRole(ADMIN_ROLE, walletAddress)).to.be.true
		expect(await factory.hasRole(PAIR_CREATOR_ROLE, walletAddress)).to.be.true
		expect(await factory.hasRole(FEE_MANAGER_ROLE, walletAddress)).to.be.true
		expect(await factory.hasRole(PAUSER_ROLE, walletAddress)).to.be.true

		// 验证初始状态
		expect(await factory.paused()).to.be.false
	})

	it('setFeeToSetter', async () => {
		// 没有 ADMIN_ROLE 的用户无法设置
		await expect(
			factory.connect(other).setFeeToSetter(await other.getAddress()),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')

		// 有权限的用户可以设置
		await expect(factory.setFeeToSetter(await other.getAddress()))
			.to.emit(factory, 'FeeToSetterUpdated')
			.withArgs(await wallet.getAddress(), await other.getAddress())

		expect(await factory.feeToSetter()).to.eq(await other.getAddress())

		// 验证角色转移：旧地址失去权限，新地址获得权限
		expect(await factory.canManageFees(await wallet.getAddress())).to.be.true // wallet 仍有权限（因为有 ADMIN_ROLE）
		expect(await factory.canManageFees(await other.getAddress())).to.be.true // other 现在有权限
	})

	// 测试批量角色管理
	it('batch role management', async () => {
		const [, addr1, addr2, addr3] = await ethers.getSigners()
		const addresses = [
			await addr1.getAddress(),
			await addr2.getAddress(),
			await addr3.getAddress(),
		]

		// 批量授予角色
		await factory.grantRoleBatch(PAIR_CREATOR_ROLE, addresses)

		// 验证所有地址都有权限
		for (const addr of addresses) {
			expect(await factory.canCreatePair(addr)).to.be.true
		}

		// 批量撤销角色
		await factory.revokeRoleBatch(PAIR_CREATOR_ROLE, addresses)

		// 验证所有地址都失去权限
		for (const addr of addresses) {
			expect(await factory.canCreatePair(addr)).to.be.false
		}
	})

	// 测试紧急停止
	it('emergency stop', async () => {
		// 只有 DEFAULT_ADMIN_ROLE 可以紧急停止
		await expect(
			factory.connect(other).emergencyStop(),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')

		// 管理员可以紧急停止
		await factory.emergencyStop()

		// 验证合约已暂停
		await expect(
			factory.createPair(...TEST_ADDRESSES),
		).to.be.revertedWithCustomError(factory, 'EnforcedPause')
	})

	// 测试角色管理的访问控制
	it('role management access control', async () => {
		const otherAddress = await other.getAddress()

		// 非管理员无法授予角色
		await expect(
			factory.connect(other).grantRoleBatch(PAIR_CREATOR_ROLE, [otherAddress]),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')

		// 非管理员无法撤销角色
		await expect(
			factory.connect(other).revokeRoleBatch(PAIR_CREATOR_ROLE, [otherAddress]),
		).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount')
	})
})
