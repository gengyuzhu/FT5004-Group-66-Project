const { expect } = require("chai");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;

async function deployVaultFixture() {
  const [creator, alice, bob, carol, outsider] = await ethers.getSigners();
  const vault = await ethers.deployContract("MilestoneVault", [2000, 3 * DAY]);

  return {
    vault,
    creator,
    alice,
    bob,
    carol,
    outsider,
  };
}

async function createCampaign(vault, creator, options = {}) {
  const now = await time.latest();
  const goal = options.goal ?? ethers.parseEther("10");
  const fundraisingDeadline = options.fundraisingDeadline ?? now + 7 * DAY;
  const milestoneAmounts = options.milestoneAmounts ?? [
    ethers.parseEther("4"),
    ethers.parseEther("6"),
  ];
  const milestoneDueDates = options.milestoneDueDates ?? [
    fundraisingDeadline + 7 * DAY,
    fundraisingDeadline + 14 * DAY,
  ];
  const metadataCID = options.metadataCID ?? "bafy-campaign";

  const campaignId = BigInt(options.campaignId ?? 0);

  await vault
    .connect(creator)
    .createCampaign(goal, fundraisingDeadline, milestoneAmounts, milestoneDueDates, metadataCID);

  return {
    campaignId,
    goal,
    fundraisingDeadline,
    milestoneAmounts,
    milestoneDueDates,
  };
}

async function fundAndActivateCampaign(vault, creator, alice, bob, options = {}) {
  const campaign = await createCampaign(vault, creator, options);

  await vault.connect(alice).contribute(campaign.campaignId, { value: ethers.parseEther("4") });
  await vault.connect(bob).contribute(campaign.campaignId, { value: ethers.parseEther("6") });

  await time.increaseTo(campaign.fundraisingDeadline);
  await vault.finalizeCampaign(campaign.campaignId);

  return campaign;
}

describe("MilestoneVault", function () {
  it("validates campaign creation inputs", async function () {
    const { vault, creator } = await loadFixture(deployVaultFixture);
    const now = await time.latest();
    const goal = ethers.parseEther("10");
    const deadline = now + 7 * DAY;

    await expect(
      vault.connect(creator).createCampaign(0, deadline, [goal], [deadline + DAY], "bafy"),
    ).to.be.revertedWith("Goal must be greater than zero");

    await expect(
      vault
        .connect(creator)
        .createCampaign(goal, now - 1, [goal], [deadline + DAY], "bafy"),
    ).to.be.revertedWith("Fundraising deadline must be in the future");

    await expect(
      vault
        .connect(creator)
        .createCampaign(
          goal,
          deadline,
          [ethers.parseEther("4")],
          [deadline + DAY, deadline + 2 * DAY],
          "bafy",
        ),
    ).to.be.revertedWith("Milestone arrays must match");

    await expect(
      vault
        .connect(creator)
        .createCampaign(
          goal,
          deadline,
          [ethers.parseEther("5"), ethers.parseEther("4")],
          [deadline + DAY, deadline + 2 * DAY],
          "bafy",
        ),
    ).to.be.revertedWith("Milestone amounts must sum to goal");

    await expect(
      vault
        .connect(creator)
        .createCampaign(
          goal,
          deadline,
          [ethers.parseEther("5"), ethers.parseEther("5")],
          [deadline + 2 * DAY, deadline + DAY],
          "bafy",
        ),
    ).to.be.revertedWith("Milestone due dates must be increasing");

    await expect(
      vault
        .connect(creator)
        .createCampaign(
          goal,
          deadline,
          [ethers.parseEther("4"), ethers.parseEther("6")],
          [deadline + DAY, deadline + 2 * DAY],
          "bafy-good",
        ),
    )
      .to.emit(vault, "CampaignCreated")
      .withArgs(0n, creator.address, goal, BigInt(deadline), "bafy-good");

    const stored = await vault.getCampaign(0);
    expect(stored.goal).to.equal(goal);
    expect(stored.metadataCID).to.equal("bafy-good");
    expect(stored.milestoneCount).to.equal(2n);
  });

  it("enforces contribution rules", async function () {
    const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
    const campaign = await createCampaign(vault, creator);

    await expect(
      vault.connect(creator).contribute(campaign.campaignId, { value: ethers.parseEther("1") }),
    ).to.be.revertedWith("Creator cannot contribute");

    await expect(
      vault.connect(alice).contribute(campaign.campaignId, { value: 0 }),
    ).to.be.revertedWith("Contribution must be greater than zero");

    await vault.connect(alice).contribute(campaign.campaignId, { value: ethers.parseEther("9") });

    await expect(
      vault.connect(bob).contribute(campaign.campaignId, { value: ethers.parseEther("2") }),
    ).to.be.revertedWith("Contribution exceeds remaining goal");

    await time.increaseTo(campaign.fundraisingDeadline);

    await expect(vault.connect(alice).contribute(campaign.campaignId, { value: 1 })).to.be.revertedWith(
      "Fundraising period has ended",
    );
  });

  it("finalizes fundraising into failed or active states", async function () {
    const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
    const underfunded = await createCampaign(vault, creator, {
      metadataCID: "bafy-under",
      milestoneAmounts: [ethers.parseEther("10")],
      milestoneDueDates: [(await time.latest()) + 8 * DAY],
    });

    await vault.connect(alice).contribute(underfunded.campaignId, { value: ethers.parseEther("2") });
    await time.increaseTo(underfunded.fundraisingDeadline);

    await expect(vault.finalizeCampaign(underfunded.campaignId))
      .to.emit(vault, "CampaignFailed")
      .withArgs(underfunded.campaignId, 1n, ethers.parseEther("2"), 0n);

    expect((await vault.getCampaign(underfunded.campaignId)).status).to.equal(1n);

    const fundedCampaignId = 1n;
    const fundedDeadline = (await time.latest()) + 7 * DAY;
    await vault
      .connect(creator)
      .createCampaign(
        ethers.parseEther("10"),
        fundedDeadline,
        [ethers.parseEther("10")],
        [fundedDeadline + 7 * DAY],
        "bafy-active",
      );

    await vault.connect(alice).contribute(fundedCampaignId, { value: ethers.parseEther("4") });
    await vault.connect(bob).contribute(fundedCampaignId, { value: ethers.parseEther("6") });
    await time.increaseTo(fundedDeadline);

    await expect(vault.finalizeCampaign(fundedCampaignId))
      .to.emit(vault, "CampaignFinalized")
      .withArgs(fundedCampaignId, 2n);

    expect((await vault.getCampaign(fundedCampaignId)).status).to.equal(2n);
  });

  it("restricts proof submission to the creator, current milestone, and due window", async function () {
    const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
    const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

    await expect(
      vault.connect(alice).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof"),
    ).to.be.revertedWith("Only the creator can submit proof");

    await expect(
      vault.connect(creator).submitMilestoneProof(campaign.campaignId, 1, "bafy-proof"),
    ).to.be.revertedWith("Milestone is not current");

    await expect(
      vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof"),
    )
      .to.emit(vault, "MilestoneProofSubmitted")
      .withArgs(campaign.campaignId, 0n, "bafy-proof", anyValue, anyValue);

    await expect(
      vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof-2"),
    ).to.be.revertedWith("Proof already submitted");

    const nextCampaignId = 1n;
    const now = await time.latest();
    const fundraisingDeadline = now + 2 * DAY;
    await vault
      .connect(creator)
      .createCampaign(
        ethers.parseEther("10"),
        fundraisingDeadline,
        [ethers.parseEther("10")],
        [fundraisingDeadline + DAY],
        "bafy-late",
      );
    await vault.connect(alice).contribute(nextCampaignId, { value: ethers.parseEther("4") });
    await vault.connect(bob).contribute(nextCampaignId, { value: ethers.parseEther("6") });
    await time.increaseTo(fundraisingDeadline);
    await vault.finalizeCampaign(nextCampaignId);
    await time.increaseTo(fundraisingDeadline + DAY + 1);

    await expect(
      vault.connect(creator).submitMilestoneProof(nextCampaignId, 0, "bafy-late-proof"),
    ).to.be.revertedWith("Milestone due date passed");
  });

  it("tracks weighted votes, one vote per backer, and rejects ineligible voters", async function () {
    const { vault, creator, alice, bob, outsider } = await loadFixture(deployVaultFixture);
    const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

    await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-vote");

    await expect(
      vault.connect(creator).voteOnMilestone(campaign.campaignId, 0, true),
    ).to.be.revertedWith("Creator cannot vote");

    await expect(
      vault.connect(outsider).voteOnMilestone(campaign.campaignId, 0, true),
    ).to.be.revertedWith("Only backers can vote");

    await expect(vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true))
      .to.emit(vault, "VoteCast")
      .withArgs(campaign.campaignId, 0n, alice.address, true, ethers.parseEther("4"));

    await expect(
      vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, false),
    ).to.be.revertedWith("Backer already voted");

    await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, false);

    const milestone = await vault.getMilestone(campaign.campaignId, 0);
    expect(milestone.yesWeight).to.equal(ethers.parseEther("4"));
    expect(milestone.noWeight).to.equal(ethers.parseEther("6"));
  });

  it("fails milestones that miss quorum", async function () {
    const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
    const now = await time.latest();
    const fundraisingDeadline = now + 7 * DAY;

    await vault
      .connect(creator)
      .createCampaign(
        ethers.parseEther("10"),
        fundraisingDeadline,
        [ethers.parseEther("10")],
        [fundraisingDeadline + 7 * DAY],
        "bafy-quorum",
      );

    await vault.connect(alice).contribute(0, { value: ethers.parseEther("1") });
    await vault.connect(bob).contribute(0, { value: ethers.parseEther("9") });
    await time.increaseTo(fundraisingDeadline);
    await vault.finalizeCampaign(0);
    await vault.connect(creator).submitMilestoneProof(0, 0, "bafy-proof");
    await vault.connect(alice).voteOnMilestone(0, 0, true);

    const milestone = await vault.getMilestone(0, 0);
    await time.increaseTo(Number(milestone.voteEnd));

    await expect(vault.executeMilestone(0, 0))
      .to.emit(vault, "MilestoneExecuted")
      .withArgs(0n, 0n, false, 0n, 1n);

    expect((await vault.getCampaign(0)).status).to.equal(1n);
  });

  it("approves milestones, releases creator withdrawals, and completes the campaign", async function () {
    const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
    const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

    await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof-0");
    await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);
    await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, true);

    const firstMilestone = await vault.getMilestone(campaign.campaignId, 0);
    await time.increaseTo(Number(firstMilestone.voteEnd));

    await expect(vault.executeMilestone(campaign.campaignId, 0))
      .to.emit(vault, "MilestoneExecuted")
      .withArgs(campaign.campaignId, 0n, true, ethers.parseEther("4"), 2n);

    expect(await vault.getCreatorWithdrawable(campaign.campaignId)).to.equal(ethers.parseEther("4"));

    await expect(vault.connect(creator).withdrawCreatorFunds(campaign.campaignId))
      .to.emit(vault, "CreatorWithdrawal")
      .withArgs(campaign.campaignId, creator.address, ethers.parseEther("4"));

    await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 1, "bafy-proof-1");
    await vault.connect(alice).voteOnMilestone(campaign.campaignId, 1, true);
    await vault.connect(bob).voteOnMilestone(campaign.campaignId, 1, true);

    const secondMilestone = await vault.getMilestone(campaign.campaignId, 1);
    await time.increaseTo(Number(secondMilestone.voteEnd));
    await vault.executeMilestone(campaign.campaignId, 1);

    const stored = await vault.getCampaign(campaign.campaignId);
    expect(stored.status).to.equal(3n);
    expect(stored.currentMilestone).to.equal(2n);
    expect(await vault.getCreatorWithdrawable(campaign.campaignId)).to.equal(ethers.parseEther("6"));
  });

  it("opens proportional refunds after a later milestone fails", async function () {
    const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
    const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

    await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-pass");
    await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);
    await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, true);

    const firstMilestone = await vault.getMilestone(campaign.campaignId, 0);
    await time.increaseTo(Number(firstMilestone.voteEnd));
    await vault.executeMilestone(campaign.campaignId, 0);
    await vault.connect(creator).withdrawCreatorFunds(campaign.campaignId);

    await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 1, "bafy-fail");
    await vault.connect(alice).voteOnMilestone(campaign.campaignId, 1, true);
    await vault.connect(bob).voteOnMilestone(campaign.campaignId, 1, false);

    const secondMilestone = await vault.getMilestone(campaign.campaignId, 1);
    await time.increaseTo(Number(secondMilestone.voteEnd));
    await vault.executeMilestone(campaign.campaignId, 1);

    expect((await vault.getCampaign(campaign.campaignId)).status).to.equal(1n);
    expect(await vault.getRefundPool(campaign.campaignId)).to.equal(ethers.parseEther("6"));
    expect(await vault.getRefundAmount(campaign.campaignId, alice.address)).to.equal(ethers.parseEther("2.4"));
    expect(await vault.getRefundAmount(campaign.campaignId, bob.address)).to.equal(ethers.parseEther("3.6"));
  });

  it("lets anyone fail an active campaign if the current milestone deadline is missed", async function () {
    const { vault, creator, alice, bob, outsider } = await loadFixture(deployVaultFixture);
    const campaign = await fundAndActivateCampaign(vault, creator, alice, bob, {
      milestoneAmounts: [ethers.parseEther("10")],
      milestoneDueDates: [(await time.latest()) + 15 * DAY],
    });

    await time.increaseTo(campaign.milestoneDueDates[0] + 1);

    await expect(vault.connect(outsider).failCampaignForMissedDeadline(campaign.campaignId))
      .to.emit(vault, "CampaignFailed")
      .withArgs(campaign.campaignId, 3n, ethers.parseEther("10"), 0n);

    expect((await vault.getCampaign(campaign.campaignId)).failureReason).to.equal(3n);
  });

  it("prevents double withdrawals, double refunds, and blocks refund reentrancy", async function () {
    const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
    const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

    await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof");
    await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);
    await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, true);

    const milestone = await vault.getMilestone(campaign.campaignId, 0);
    await time.increaseTo(Number(milestone.voteEnd));
    await vault.executeMilestone(campaign.campaignId, 0);
    await vault.connect(creator).withdrawCreatorFunds(campaign.campaignId);

    await expect(vault.connect(creator).withdrawCreatorFunds(campaign.campaignId)).to.be.revertedWith(
      "No funds available",
    );

    const now = await time.latest();
    const refundDeadline = now + 2 * DAY;
    await vault
      .connect(creator)
      .createCampaign(
        ethers.parseEther("2"),
        refundDeadline,
        [ethers.parseEther("2")],
        [refundDeadline + 7 * DAY],
        "bafy-refund",
      );

    const attackerFactory = await ethers.getContractFactory("ReentrantRefundAttacker");
    const attacker = await attackerFactory.connect(alice).deploy(await vault.getAddress());
    await attacker.waitForDeployment();

    await attacker.connect(alice).contributeToCampaign(1, { value: ethers.parseEther("1") });
    await vault.connect(bob).contribute(1, { value: ethers.parseEther("0.5") });
    await time.increaseTo(refundDeadline);
    await vault.finalizeCampaign(1);

    await attacker.connect(alice).attackClaimRefund(1);
    expect(await attacker.reentryAttempted()).to.equal(true);
    expect(await attacker.reentryBlocked()).to.equal(true);

    await expect(attacker.connect(alice).attackClaimRefund(1)).to.be.revertedWith(
      "Refund already claimed",
    );
  });
});
