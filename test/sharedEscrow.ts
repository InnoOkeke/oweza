import { expect } from "chai";
import hardhat from "hardhat";
import { AbiCoder, BigNumberish } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hardhat;
const abiCoder = AbiCoder.defaultAbiCoder();
const VERSION_SALT = ethers.id("MS_ESCROW_V1");

function computeTransferId(recipientHash: string, amount: BigNumberish, expiry: number) {
  return ethers.keccak256(abiCoder.encode(["bytes32", "bytes32", "uint96", "uint40"], [VERSION_SALT, recipientHash, amount, expiry]));
}

const emptyPermit = {
  enabled: false,
  value: 0,
  deadline: 0,
  v: 0,
  r: ethers.ZeroHash,
  s: ethers.ZeroHash,
};

describe("SharedEscrow", () => {
  async function deployFixture() {
    const [admin, sender, recipient] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockUSDC");
    const token = await Token.deploy();

    const SharedEscrow = await ethers.getContractFactory("SharedEscrow");
    const escrow = await SharedEscrow.deploy(admin.address);

    const mintAmount = ethers.parseUnits("1000", 6);
    await (token as any).connect(admin).mint(sender.address, mintAmount);

    return { escrow, token, admin, sender, recipient };
  }

  it("creates a transfer and updates locked balance", async () => {
    const { escrow, token, admin, sender } = await deployFixture();

    const amount = ethers.parseUnits("10", 6);
    const escrowAddress = await escrow.getAddress();
    const tokenAddress = await token.getAddress();
    await (token as any).connect(sender).approve(escrowAddress, amount);

    const recipientHash = ethers.keccak256(ethers.toUtf8Bytes("alice@example.com"));
    const expiry = (await time.latest()) + 3600;
    const transferId = computeTransferId(recipientHash, amount, expiry);

    await expect(
      (escrow as any).connect(admin).createTransfer(
        {
          transferId,
          token: tokenAddress,
          fundingWallet: sender.address,
          amount,
          recipientHash,
          expiry,
        },
        emptyPermit
      )
    )
      .to.emit(escrow, "TransferCreated")
      .withArgs(transferId, sender.address, recipientHash, tokenAddress, amount, expiry);

    const stored = await (escrow as any).getTransfer(transferId);
    expect(stored.amount).to.equal(amount);
    expect(await (escrow as any).lockedBalance(tokenAddress)).to.equal(amount);
  });

  it("claims a pending transfer", async () => {
    const { escrow, token, admin, sender, recipient } = await deployFixture();

    const amount = ethers.parseUnits("25", 6);
    const escrowAddress = await escrow.getAddress();
    const tokenAddress = await token.getAddress();
    await (token as any).connect(sender).approve(escrowAddress, amount);

    const recipientHash = ethers.keccak256(ethers.toUtf8Bytes("bob@example.com"));
    const expiry = (await time.latest()) + 3600;
    const transferId = computeTransferId(recipientHash, amount, expiry);

    await (escrow as any).connect(admin).createTransfer(
      { transferId, token: tokenAddress, fundingWallet: sender.address, amount, recipientHash, expiry },
      emptyPermit
    );

    await expect((escrow as any).connect(admin).claimTransfer(transferId, recipient.address, recipientHash))
      .to.emit(escrow, "TransferClaimed")
      .withArgs(transferId, recipient.address);

    expect(await token.balanceOf(recipient.address)).to.equal(amount);
    const info = await (escrow as any).getTransfer(transferId);
    expect(info.status).to.equal(2); // Status.Claimed
  });

  it("refunds after expiry", async () => {
    const { escrow, token, admin, sender } = await deployFixture();

    const amount = ethers.parseUnits("5", 6);
    const escrowAddress = await escrow.getAddress();
    const tokenAddress = await token.getAddress();
    await (token as any).connect(sender).approve(escrowAddress, amount);

    const recipientHash = ethers.keccak256(ethers.toUtf8Bytes("carol@example.com"));
    const expiry = (await time.latest()) + 10;
    const transferId = computeTransferId(recipientHash, amount, expiry);

    await (escrow as any).connect(admin).createTransfer(
      { transferId, token: tokenAddress, fundingWallet: sender.address, amount, recipientHash, expiry },
      emptyPermit
    );

    await time.increaseTo(expiry + 1);

    const prevBalance = await token.balanceOf(sender.address);
    await expect((escrow as any).connect(admin).refundTransfer(transferId, sender.address))
      .to.emit(escrow, "TransferRefunded")
      .withArgs(transferId, sender.address);

    const newBalance = await token.balanceOf(sender.address);
    expect(newBalance).to.equal(prevBalance + amount);
    const info = await (escrow as any).getTransfer(transferId);
    expect(info.status).to.equal(3); // Refunded
  });

  it("prevents operations while paused", async () => {
    const { escrow, token, admin, sender } = await deployFixture();

    await (escrow as any).connect(admin).pause();

    const amount = ethers.parseUnits("1", 6);
    const escrowAddress = await escrow.getAddress();
    const tokenAddress = await token.getAddress();
    await (token as any).connect(sender).approve(escrowAddress, amount);

    const recipientHash = ethers.keccak256(ethers.toUtf8Bytes("eve@example.com"));
    const expiry = (await time.latest()) + 3600;
    const transferId = computeTransferId(recipientHash, amount, expiry);

    await expect(
      (escrow as any).connect(admin).createTransfer(
        { transferId, token: tokenAddress, fundingWallet: sender.address, amount, recipientHash, expiry },
        emptyPermit
      )
    ).to.be.revertedWithCustomError(escrow, "EnforcedPause");
  });
});
