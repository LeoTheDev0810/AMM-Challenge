import { ethers, upgrades } from 'hardhat'
import { AMMFactory, AMMRouter01, WETH9 } from '../typechain-types'

async function main() {
	console.log('开始部署 AMM 合约...')

	// 获取部署账户
	const [deployer] = await ethers.getSigners()
	console.log('部署账户:', deployer.address)
	console.log(
		'账户余额:',
		ethers.formatEther(await deployer.provider.getBalance(deployer.address)),
		'ETH',
	)

	// 1. 部署 WETH9 合约
	console.log('\n1. 部署 WETH9 合约...')
	const WETH9Factory = await ethers.getContractFactory('WETH9')
	const weth = (await WETH9Factory.deploy()) as WETH9
	await weth.waitForDeployment()
	const wethAddress = await weth.getAddress()
	console.log('WETH9 合约地址:', wethAddress)

	// 2. 部署 AMMFactory 可升级合约
	console.log('\n2. 部署 AMMFactory 可升级合约...')
	const AMMFactoryFactory = await ethers.getContractFactory('AMMFactory')
	const factory = (await upgrades.deployProxy(
		AMMFactoryFactory,
		[deployer.address], // feeToSetter 参数
		{
			initializer: 'initialize',
			kind: 'uups',
		},
	)) as unknown as AMMFactory
	await factory.waitForDeployment()
	const factoryAddress = await factory.getAddress()
	console.log('AMMFactory 代理合约地址:', factoryAddress)
	console.log(
		'AMMFactory 实现合约地址:',
		await upgrades.erc1967.getImplementationAddress(factoryAddress),
	)

	// 3. 部署 AMMRouter01 可升级合约
	console.log('\n3. 部署 AMMRouter01 可升级合约...')
	const AMMRouter01Factory = await ethers.getContractFactory('AMMRouter01')
	const router = (await upgrades.deployProxy(
		AMMRouter01Factory,
		[factoryAddress, wethAddress], // factory 和 WETH 地址参数
		{
			initializer: 'initialize',
			kind: 'uups',
		},
	)) as unknown as AMMRouter01
	await router.waitForDeployment()
	const routerAddress = await router.getAddress()
	console.log('AMMRouter01 代理合约地址:', routerAddress)
	console.log(
		'AMMRouter01 实现合约地址:',
		await upgrades.erc1967.getImplementationAddress(routerAddress),
	)

	// 4. 验证部署
	console.log('\n4. 验证部署结果...')
	const factoryFromRouter = await router.factory()
	const wethFromRouter = await router.WETH()
	const feeToSetter = await factory.feeToSetter()

	console.log('路由合约中的工厂地址:', factoryFromRouter)
	console.log('路由合约中的 WETH 地址:', wethFromRouter)
	console.log('工厂合约的费用设置者:', feeToSetter)

	// 验证地址匹配
	if (factoryFromRouter === factoryAddress) {
		console.log('✅ 工厂地址匹配')
	} else {
		console.log('❌ 工厂地址不匹配')
	}

	if (wethFromRouter === wethAddress) {
		console.log('✅ WETH 地址匹配')
	} else {
		console.log('❌ WETH 地址不匹配')
	}

	if (feeToSetter === deployer.address) {
		console.log('✅ 费用设置者地址匹配')
	} else {
		console.log('❌ 费用设置者地址不匹配')
	}

	// 5. 输出部署摘要
	console.log('\n=== 部署摘要 ===')
	console.log('网络:', (await ethers.provider.getNetwork()).name)
	console.log('链 ID:', (await ethers.provider.getNetwork()).chainId)
	console.log('部署者:', deployer.address)
	console.log('WETH9 合约:', wethAddress)
	console.log('AMMFactory 代理:', factoryAddress)
	console.log('AMMRouter01 代理:', routerAddress)

	// 6. 保存部署信息到文件
	const deploymentInfo = {
		network: (await ethers.provider.getNetwork()).name,
		chainId: Number((await ethers.provider.getNetwork()).chainId),
		deployer: deployer.address,
		timestamp: new Date().toISOString(),
		contracts: {
			WETH9: {
				address: wethAddress,
				type: 'regular',
			},
			AMMFactory: {
				proxy: factoryAddress,
				implementation: await upgrades.erc1967.getImplementationAddress(
					factoryAddress,
				),
				type: 'upgradeable',
			},
			AMMRouter01: {
				proxy: routerAddress,
				implementation: await upgrades.erc1967.getImplementationAddress(
					routerAddress,
				),
				type: 'upgradeable',
			},
		},
	}

	// 写入部署信息文件
	const fs = require('fs')
	const deploymentFileName = `deployment-${
		(await ethers.provider.getNetwork()).chainId
	}-${Date.now()}.json`
	fs.writeFileSync(deploymentFileName, JSON.stringify(deploymentInfo, null, 2))
	console.log(`\n部署信息已保存到: ${deploymentFileName}`)

	console.log('\n🎉 AMM 合约部署完成!')
}

// 错误处理
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('部署失败:', error)
		process.exit(1)
	})
