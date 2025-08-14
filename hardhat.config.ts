import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@openzeppelin/hardhat-upgrades'

// Load environment variables if present
import * as dotenv from 'dotenv'
dotenv.config()

// Default to a placeholder private key for development
const PRIVATE_KEY =
	process.env.PRIVATE_KEY ||
	'0x0000000000000000000000000000000000000000000000000000000000000000'

const config: HardhatUserConfig = {
	solidity: {
		version: '0.8.22',
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
			// Enable viaIR to solve 'Stack too deep' errors
			viaIR: true,
		},
	},
	networks: {
		hardhat: {
			chainId: 31337,
		},
		localhost: {
			url: 'http://127.0.0.1:8545',
		},
		// Add these networks when you're ready to deploy to testnet/mainnet
		sepolia: {
			url:
				process.env.SEPOLIA_RPC_URL ||
				'https://sepolia.infura.io/v3/your-api-key',
			accounts: [PRIVATE_KEY],
		},
		mainnet: {
			url:
				process.env.MAINNET_RPC_URL ||
				'https://mainnet.infura.io/v3/your-api-key',
			accounts: [PRIVATE_KEY],
		},
	},
	etherscan: {
		apiKey: process.env.ETHERSCAN_API_KEY || '',
	},
	gasReporter: {
		enabled: process.env.REPORT_GAS !== undefined,
		currency: 'USD',
		coinmarketcap: process.env.COINMARKETCAP_API_KEY || '',
	},
}

export default config
