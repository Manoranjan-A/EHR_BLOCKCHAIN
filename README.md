# EHR Blockchain Complete — Full Stack Prototype (Minimal UI)

This package contains a full-stack prototype with:
- Frontend: minimal Admin / Patient / Doctor dashboards (plain HTML+JS).
- Backend: Express APIs, AES-256-GCM file encryption, ECC key wrapping, JSON storage.
- Blockchain: Hardhat project with `EHRRegistry.sol` and deploy script that writes backend/contractAddress.json.

## What's included
- package.json (with Hardhat dev deps)
- hardhat.config.js
- contracts/EHRRegistry.sol
- scripts/deploy.js
- backend/ (server.js, crypto-utils.js, storage)
- frontend/ (index.html, admin.html, patient.html, doctor.html)

## Quick start (exact steps)

1. Install Node 18+ (recommended).
2. Unzip this project and open a terminal in the project root.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start a Hardhat local node in a separate terminal (optional but required for blockchain logging):
   ```bash
   npx hardhat node
   ```
   Leave it running.
5. Deploy the contract to the local node (in another terminal):
   ```bash
   npx hardhat run --network localhost scripts/deploy.js
   ```
   This will compile and deploy the contract and write `backend/contractAddress.json` containing the deployed address.
6. Start the backend (this also serves the frontend):
   ```bash
   npm run start-backend
   ```
   You should see `Backend listening on 4001` in the console. If the contract was deployed, you should also see `Blockchain contract loaded at ...`.
7. Open your browser to: http://localhost:4001/
   - Admin Dashboard: register patients & doctors, list users.
   - Patient Dashboard: login, upload EHR (file), list EHRs, view pending requests, approve (requires owner's private key in demo).
   - Doctor Dashboard: login, search patients, request access, fetch decrypted EHR (auto-download).

## Notes & Security
- For demo convenience, registration endpoints return the generated ECC private key in the response. **Do not** expose private keys in production. Use client-side key generation and secure storage.
- Files are encrypted with AES-256-GCM and stored under `backend/storage/ehrs` as hex. Metadata is under `backend/storage/store.json`.
- Blockchain logging is optional; backend will work without deploying the contract, but won't emit events to the chain.
- If you change contracts, re-run `npx hardhat compile` and re-deploy, then restart backend so it picks up new artifacts and contractAddress.json.
# EHR_BLOCKCHAIN
# EHR_BLOCKCHAIN
