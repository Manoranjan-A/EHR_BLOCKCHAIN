// deploy script
const hre = require("hardhat");
const fs = require("fs");
async function main() {
  const EHR = await hre.ethers.getContractFactory("EHRRegistry");
  const ehr = await EHR.deploy();
  await ehr.deployed();
  console.log("EHRRegistry deployed to:", ehr.address);
  fs.writeFileSync('backend/contractAddress.json', JSON.stringify({ address: ehr.address }, null, 2));
}
main().catch((e)=>{ console.error(e); process.exitCode=1; });
