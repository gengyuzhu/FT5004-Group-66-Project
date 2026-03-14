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
    metadataCID,
  };
}

async function fundAndActivateCampaign(vault, creator, alice, bob, options = {}) {
  const campaign = await createCampaign(vault, creator, options);

  const aliceAmount = options.aliceAmount ?? ethers.parseEther("4");
  const bobAmount = options.bobAmount ?? ethers.parseEther("6");

  await vault.connect(alice).contribute(campaign.campaignId, { value: aliceAmount });
  await vault.connect(bob).contribute(campaign.campaignId, { value: bobAmount });

  await time.increaseTo(campaign.fundraisingDeadline);
  await vault.finalizeCampaign(campaign.campaignId);

  return campaign;
}

async function openVoting(vault, creator, alice, bob, options = {}) {
  const campaign = await fundAndActivateCampaign(vault, creator, alice, bob, options);
  const proofCID = options.proofCID ?? "bafy-proof";

  await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, proofCID);

  return campaign;
}

describe("MilestoneVault", function () {
  describe("createCampaign", function () {
    it("rejects a zero goal", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const now = await time.latest();

      await expect(
        vault.connect(creator).createCampaign(0, now + 7 * DAY, [1], [now + 8 * DAY], "bafy"),
      ).to.be.revertedWith("Goal must be greater than zero");
    });

    it("rejects a fundraising deadline in the past", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const now = await time.latest();

      await expect(
        vault
          .connect(creator)
          .createCampaign(ethers.parseEther("1"), now - 1, [ethers.parseEther("1")], [now + DAY], "bafy"),
      ).to.be.revertedWith("Fundraising deadline must be in the future");
    });

    it("rejects mismatched milestone arrays", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const now = await time.latest();

      await expect(
        vault
          .connect(creator)
          .createCampaign(
            ethers.parseEther("2"),
            now + 7 * DAY,
            [ethers.parseEther("2")],
            [now + 8 * DAY, now + 9 * DAY],
            "bafy",
          ),
      ).to.be.revertedWith("Milestone arrays must match");
    });

    it("rejects milestone totals that do not equal the goal", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const now = await time.latest();

      await expect(
        vault
          .connect(creator)
          .createCampaign(
            ethers.parseEther("10"),
            now + 7 * DAY,
            [ethers.parseEther("4"), ethers.parseEther("5")],
            [now + 8 * DAY, now + 9 * DAY],
            "bafy",
          ),
      ).to.be.revertedWith("Milestone amounts must sum to goal");
    });

    it("rejects a missing metadata CID", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const now = await time.latest();

      await expect(
        vault
          .connect(creator)
          .createCampaign(
            ethers.parseEther("10"),
            now + 7 * DAY,
            [ethers.parseEther("10")],
            [now + 10 * DAY],
            "",
          ),
      ).to.be.revertedWith("Metadata CID is required");
    });

    it("rejects campaigns without milestones", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const now = await time.latest();

      await expect(
        vault.connect(creator).createCampaign(ethers.parseEther("10"), now + 7 * DAY, [], [], "bafy"),
      ).to.be.revertedWith("At least one milestone is required");
    });

    it("rejects milestone due dates that are not strictly increasing", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const now = await time.latest();

      await expect(
        vault
          .connect(creator)
          .createCampaign(
            ethers.parseEther("10"),
            now + 7 * DAY,
            [ethers.parseEther("5"), ethers.parseEther("5")],
            [now + 10 * DAY, now + 9 * DAY],
            "bafy",
          ),
      ).to.be.revertedWith("Milestone due dates must be increasing");
    });

    it("stores the campaign and milestones when inputs are valid", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator, {
        metadataCID: "bafy-good",
      });

      await expect(
        vault
          .connect(creator)
          .createCampaign(
            ethers.parseEther("3"),
            (await time.latest()) + 10 * DAY,
            [ethers.parseEther("1"), ethers.parseEther("2")],
            [(await time.latest()) + 11 * DAY, (await time.latest()) + 12 * DAY],
            "bafy-other",
          ),
      )
        .to.emit(vault, "CampaignCreated")
        .withArgs(1n, creator.address, ethers.parseEther("3"), anyValue, "bafy-other");

      const storedCampaign = await vault.getCampaign(campaign.campaignId);
      const storedMilestone = await vault.getMilestone(campaign.campaignId, 1);

      expect(storedCampaign.goal).to.equal(campaign.goal);
      expect(storedCampaign.metadataCID).to.equal("bafy-good");
      expect(storedCampaign.status).to.equal(0n);
      expect(storedCampaign.milestoneCount).to.equal(2n);
      expect(storedMilestone.amount).to.equal(ethers.parseEther("6"));
    });
  });

  describe("contribute", function () {
    it("rejects creator self-funding", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator);

      await expect(
        vault.connect(creator).contribute(campaign.campaignId, { value: ethers.parseEther("1") }),
      ).to.be.revertedWith("Creator cannot contribute");
    });

    it("rejects a zero-value contribution", async function () {
      const { vault, creator, alice } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator);

      await expect(
        vault.connect(alice).contribute(campaign.campaignId, { value: 0 }),
      ).to.be.revertedWith("Contribution must be greater than zero");
    });

    it("rejects contributions above the remaining goal", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator);

      await vault.connect(alice).contribute(campaign.campaignId, { value: ethers.parseEther("9") });

      await expect(
        vault.connect(bob).contribute(campaign.campaignId, { value: ethers.parseEther("2") }),
      ).to.be.revertedWith("Contribution exceeds remaining goal");
    });

    it("records valid contributions and rejects contributions after the deadline", async function () {
      const { vault, creator, alice } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator);

      await expect(
        vault.connect(alice).contribute(campaign.campaignId, { value: ethers.parseEther("4") }),
      )
        .to.emit(vault, "ContributionReceived")
        .withArgs(campaign.campaignId, alice.address, ethers.parseEther("4"), ethers.parseEther("4"));

      expect(await vault.getContributionAmount(campaign.campaignId, alice.address)).to.equal(
        ethers.parseEther("4"),
      );

      await time.increaseTo(campaign.fundraisingDeadline);

      await expect(
        vault.connect(alice).contribute(campaign.campaignId, { value: 1 }),
      ).to.be.revertedWith("Fundraising period has ended");
    });
  });

  describe("finalizeCampaign", function () {
    it("rejects finalization before the fundraising deadline", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator);

      await expect(vault.finalizeCampaign(campaign.campaignId)).to.be.revertedWith(
        "Fundraising deadline not reached",
      );
    });

    it("marks underfunded campaigns as failed", async function () {
      const { vault, creator, alice } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator, {
        milestoneAmounts: [ethers.parseEther("10")],
        milestoneDueDates: [(await time.latest()) + 10 * DAY],
      });

      await vault.connect(alice).contribute(campaign.campaignId, { value: ethers.parseEther("2") });
      await time.increaseTo(campaign.fundraisingDeadline);

      await expect(vault.finalizeCampaign(campaign.campaignId))
        .to.emit(vault, "CampaignFailed")
        .withArgs(campaign.campaignId, 1n, ethers.parseEther("2"), 0n);

      expect((await vault.getCampaign(campaign.campaignId)).status).to.equal(1n);
    });

    it("marks fully funded campaigns as active", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator, {
        milestoneAmounts: [ethers.parseEther("10")],
        milestoneDueDates: [(await time.latest()) + 10 * DAY],
      });

      await vault.connect(alice).contribute(campaign.campaignId, { value: ethers.parseEther("4") });
      await vault.connect(bob).contribute(campaign.campaignId, { value: ethers.parseEther("6") });
      await time.increaseTo(campaign.fundraisingDeadline);

      await expect(vault.finalizeCampaign(campaign.campaignId))
        .to.emit(vault, "CampaignFinalized")
        .withArgs(campaign.campaignId, 2n);

      expect((await vault.getCampaign(campaign.campaignId)).status).to.equal(2n);
    });
  });

  describe("submitMilestoneProof", function () {
    it("only allows the creator to submit proof for the current milestone", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

      await expect(
        vault.connect(alice).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof"),
      ).to.be.revertedWith("Only the creator can submit proof");

      await expect(
        vault.connect(creator).submitMilestoneProof(campaign.campaignId, 1, "bafy-proof"),
      ).to.be.revertedWith("Milestone is not current");
    });

    it("stores the proof CID and opens the vote window", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

      await expect(
        vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof"),
      )
        .to.emit(vault, "MilestoneProofSubmitted")
        .withArgs(campaign.campaignId, 0n, "bafy-proof", anyValue, anyValue);

      const milestone = await vault.getMilestone(campaign.campaignId, 0);
      expect(milestone.proofCID).to.equal("bafy-proof");
      expect(milestone.voteStart).to.be.greaterThan(0n);
      expect(milestone.voteEnd).to.be.greaterThan(milestone.voteStart);
    });

    it("rejects duplicate proof submissions and proof after the milestone due date", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

      await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof");

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

    it("rejects an empty proof CID", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

      await expect(
        vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, ""),
      ).to.be.revertedWith("Proof CID is required");
    });
  });

  describe("voteOnMilestone", function () {
    it("rejects votes cast by the creator", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await expect(
        vault.connect(creator).voteOnMilestone(campaign.campaignId, 0, true),
      ).to.be.revertedWith("Creator cannot vote");
    });

    it("rejects votes from non-backers", async function () {
      const { vault, creator, alice, bob, outsider } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await expect(
        vault.connect(outsider).voteOnMilestone(campaign.campaignId, 0, true),
      ).to.be.revertedWith("Only backers can vote");
    });

    it("rejects votes before proof has been submitted", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

      await expect(
        vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true),
      ).to.be.revertedWith("Proof not submitted");
    });

    it("records weighted yes and no votes", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await expect(vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true))
        .to.emit(vault, "VoteCast")
        .withArgs(campaign.campaignId, 0n, alice.address, true, ethers.parseEther("4"));

      await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, false);

      const milestone = await vault.getMilestone(campaign.campaignId, 0);
      expect(milestone.yesWeight).to.equal(ethers.parseEther("4"));
      expect(milestone.noWeight).to.equal(ethers.parseEther("6"));
    });

    it("prevents duplicate votes and rejects votes after the window closes", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);

      await expect(
        vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, false),
      ).to.be.revertedWith("Backer already voted");

      const milestone = await vault.getMilestone(campaign.campaignId, 0);
      await time.increaseTo(Number(milestone.voteEnd));

      await expect(
        vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, true),
      ).to.be.revertedWith("Voting period has ended");
    });
  });

  describe("executeMilestone", function () {
    it("rejects execution before the voting window ends", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);

      await expect(vault.executeMilestone(campaign.campaignId, 0)).to.be.revertedWith(
        "Voting period not ended",
      );
    });

    it("fails the campaign when quorum is not reached", async function () {
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

    it("fails the campaign when no votes outweigh yes votes", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);
      await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, false);

      const milestone = await vault.getMilestone(campaign.campaignId, 0);
      await time.increaseTo(Number(milestone.voteEnd));
      await vault.executeMilestone(campaign.campaignId, 0);

      expect((await vault.getCampaign(campaign.campaignId)).status).to.equal(1n);
      expect((await vault.getCampaign(campaign.campaignId)).failureReason).to.equal(2n);
    });

    it("approves a passed milestone and increases creator withdrawable balance", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);
      await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, true);

      const milestone = await vault.getMilestone(campaign.campaignId, 0);
      await time.increaseTo(Number(milestone.voteEnd));

      await expect(vault.executeMilestone(campaign.campaignId, 0))
        .to.emit(vault, "MilestoneExecuted")
        .withArgs(campaign.campaignId, 0n, true, ethers.parseEther("4"), 2n);

      expect(await vault.getCreatorWithdrawable(campaign.campaignId)).to.equal(
        ethers.parseEther("4"),
      );
    });

    it("marks the campaign completed after the final milestone passes", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await fundAndActivateCampaign(vault, creator, alice, bob);

      await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof-0");
      await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);
      await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, true);

      const firstMilestone = await vault.getMilestone(campaign.campaignId, 0);
      await time.increaseTo(Number(firstMilestone.voteEnd));
      await vault.executeMilestone(campaign.campaignId, 0);

      await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 1, "bafy-proof-1");
      await vault.connect(alice).voteOnMilestone(campaign.campaignId, 1, true);
      await vault.connect(bob).voteOnMilestone(campaign.campaignId, 1, true);

      const secondMilestone = await vault.getMilestone(campaign.campaignId, 1);
      await time.increaseTo(Number(secondMilestone.voteEnd));
      await vault.executeMilestone(campaign.campaignId, 1);

      const storedCampaign = await vault.getCampaign(campaign.campaignId);
      expect(storedCampaign.status).to.equal(3n);
      expect(storedCampaign.currentMilestone).to.equal(2n);
    });
  });

  describe("withdrawCreatorFunds", function () {
    it("lets the creator withdraw approved milestone funds", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);
      await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, true);

      const milestone = await vault.getMilestone(campaign.campaignId, 0);
      await time.increaseTo(Number(milestone.voteEnd));
      await vault.executeMilestone(campaign.campaignId, 0);

      await expect(vault.connect(creator).withdrawCreatorFunds(campaign.campaignId))
        .to.emit(vault, "CreatorWithdrawal")
        .withArgs(campaign.campaignId, creator.address, ethers.parseEther("4"));
    });

    it("rejects non-creator withdrawals and repeat withdrawals without new approval", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);
      await vault.connect(bob).voteOnMilestone(campaign.campaignId, 0, true);

      const milestone = await vault.getMilestone(campaign.campaignId, 0);
      await time.increaseTo(Number(milestone.voteEnd));
      await vault.executeMilestone(campaign.campaignId, 0);

      await expect(
        vault.connect(alice).withdrawCreatorFunds(campaign.campaignId),
      ).to.be.revertedWith("Only the creator can withdraw");

      await vault.connect(creator).withdrawCreatorFunds(campaign.campaignId);

      await expect(vault.connect(creator).withdrawCreatorFunds(campaign.campaignId)).to.be.revertedWith(
        "No funds available",
      );
    });
  });

  describe("claimRefund", function () {
    it("lets backers claim refunds after underfunded fundraising", async function () {
      const { vault, creator, alice } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator, {
        milestoneAmounts: [ethers.parseEther("10")],
        milestoneDueDates: [(await time.latest()) + 8 * DAY],
      });

      await vault.connect(alice).contribute(campaign.campaignId, { value: ethers.parseEther("2") });
      await time.increaseTo(campaign.fundraisingDeadline);
      await vault.finalizeCampaign(campaign.campaignId);

      await expect(vault.connect(alice).claimRefund(campaign.campaignId))
        .to.emit(vault, "RefundClaimed")
        .withArgs(campaign.campaignId, alice.address, ethers.parseEther("2"));
    });

    it("calculates proportional refunds after a later milestone failure", async function () {
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

      expect(await vault.getRefundPool(campaign.campaignId)).to.equal(ethers.parseEther("6"));
      expect(await vault.getRefundAmount(campaign.campaignId, alice.address)).to.equal(
        ethers.parseEther("2.4"),
      );
      expect(await vault.getRefundAmount(campaign.campaignId, bob.address)).to.equal(
        ethers.parseEther("3.6"),
      );
    });

    it("prevents double refunds and blocks refund reentrancy", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
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

      await attacker.connect(alice).contributeToCampaign(0, { value: ethers.parseEther("1") });
      await vault.connect(bob).contribute(0, { value: ethers.parseEther("0.5") });
      await time.increaseTo(refundDeadline);
      await vault.finalizeCampaign(0);

      await attacker.connect(alice).attackClaimRefund(0);

      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentryBlocked()).to.equal(true);

      await expect(attacker.connect(alice).attackClaimRefund(0)).to.be.revertedWith(
        "Refund already claimed",
      );
    });

    it("opens refunds after a missed milestone deadline", async function () {
      const { vault, creator, alice, bob, outsider } = await loadFixture(deployVaultFixture);
      const campaign = await fundAndActivateCampaign(vault, creator, alice, bob, {
        milestoneAmounts: [ethers.parseEther("10")],
        milestoneDueDates: [(await time.latest()) + 15 * DAY],
      });

      await time.increaseTo(campaign.milestoneDueDates[0] + 1);

      await expect(vault.connect(outsider).failCampaignForMissedDeadline(campaign.campaignId))
        .to.emit(vault, "CampaignFailed")
        .withArgs(campaign.campaignId, 3n, ethers.parseEther("10"), 0n);

      await expect(vault.connect(alice).claimRefund(campaign.campaignId))
        .to.emit(vault, "RefundClaimed")
        .withArgs(campaign.campaignId, alice.address, ethers.parseEther("4"));
    });
  });

  describe("failCampaignForMissedDeadline", function () {
    it("rejects failure before the active milestone due date", async function () {
      const { vault, creator, alice, bob, outsider } = await loadFixture(deployVaultFixture);
      const campaign = await fundAndActivateCampaign(vault, creator, alice, bob, {
        milestoneAmounts: [ethers.parseEther("10")],
        milestoneDueDates: [(await time.latest()) + 15 * DAY],
      });

      await expect(
        vault.connect(outsider).failCampaignForMissedDeadline(campaign.campaignId),
      ).to.be.revertedWith("Milestone deadline not missed");
    });

    it("rejects failure if proof was already submitted for the active milestone", async function () {
      const { vault, creator, alice, bob, outsider } = await loadFixture(deployVaultFixture);
      const campaign = await fundAndActivateCampaign(vault, creator, alice, bob, {
        milestoneAmounts: [ethers.parseEther("10")],
        milestoneDueDates: [(await time.latest()) + 15 * DAY],
      });

      await vault.connect(creator).submitMilestoneProof(campaign.campaignId, 0, "bafy-proof");
      await time.increaseTo(campaign.milestoneDueDates[0] + 1);

      await expect(
        vault.connect(outsider).failCampaignForMissedDeadline(campaign.campaignId),
      ).to.be.revertedWith("Proof already submitted");
    });
  });

  describe("view functions", function () {
    it("returns campaign and milestone snapshots", async function () {
      const { vault, creator } = await loadFixture(deployVaultFixture);
      const campaign = await createCampaign(vault, creator, {
        metadataCID: "bafy-view",
      });

      const campaignSnapshot = await vault.getCampaign(campaign.campaignId);
      const milestoneSnapshot = await vault.getMilestone(campaign.campaignId, 0);

      expect(campaignSnapshot.creator).to.equal(creator.address);
      expect(campaignSnapshot.metadataCID).to.equal("bafy-view");
      expect(milestoneSnapshot.amount).to.equal(ethers.parseEther("4"));
      expect(milestoneSnapshot.executed).to.equal(false);
    });

    it("returns backer contribution, refund state, and vote receipt snapshots", async function () {
      const { vault, creator, alice, bob } = await loadFixture(deployVaultFixture);
      const campaign = await openVoting(vault, creator, alice, bob);

      await vault.connect(alice).voteOnMilestone(campaign.campaignId, 0, true);

      const backerState = await vault.getBackerState(campaign.campaignId, alice.address);
      const voteReceipt = await vault.getVoteReceipt(campaign.campaignId, 0, alice.address);

      expect(backerState.contributionAmount).to.equal(ethers.parseEther("4"));
      expect(backerState.refundClaimed).to.equal(false);
      expect(voteReceipt.hasVoted).to.equal(true);
      expect(voteReceipt.support).to.equal(true);
    });
  });
});
