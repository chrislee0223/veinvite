# Testnet Setup

1. Deploy this repository to a public testnet URL.
2. Set `NEXT_PUBLIC_NETWORK_TYPE=test`.
3. Add a WalletConnect project ID only if WalletConnect is required; VeWorld can be the first supported wallet.
4. Open the VeBetterDAO test environment and create a test app.
5. Record the generated testnet App ID.
6. Configure the reward distributor and test B3TR funding.
7. Replace mock eligibility and activation services with real indexed/on-chain checks.
8. Call reward distribution with proof and metadata.
9. Capture transaction IDs and screenshots for the application evidence package.

Never put a distributor private key in `NEXT_PUBLIC_*` variables or frontend code.
