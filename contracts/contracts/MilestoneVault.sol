// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MilestoneVault is ReentrancyGuard {
    using Address for address payable;

    enum CampaignStatus {
        Fundraising,
        Failed,
        Active,
        Completed
    }

    enum FailureReason {
        None,
        Underfunded,
        VoteRejected,
        MissedMilestoneDeadline
    }

    struct Campaign {
        address creator;
        uint256 goal;
        uint64 fundraisingDeadline;
        uint64 createdAt;
        uint256 totalRaised;
        CampaignStatus status;
        uint256 milestoneCount;
        uint256 currentMilestone;
        uint256 approvedPayoutTotal;
        uint256 creatorWithdrawn;
        string metadataCID;
        FailureReason failureReason;
    }

    struct Milestone {
        uint256 amount;
        uint64 dueDate;
        string proofCID;
        uint64 voteStart;
        uint64 voteEnd;
        uint256 yesWeight;
        uint256 noWeight;
        bool executed;
    }

    struct VoteReceipt {
        bool hasVoted;
        bool support;
    }

    uint256 public immutable quorumBps;
    uint256 public immutable votingDuration;
    uint256 public campaignCount;

    mapping(uint256 campaignId => Campaign) private _campaigns;
    mapping(uint256 campaignId => Milestone[]) private _milestones;
    mapping(uint256 campaignId => mapping(address backer => uint256 amount)) private _contributions;
    mapping(uint256 campaignId => mapping(address backer => bool claimed)) private _refundClaimed;
    mapping(uint256 campaignId => mapping(uint256 milestoneId => mapping(address voter => VoteReceipt)))
        private _voteReceipts;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        uint256 goal,
        uint64 fundraisingDeadline,
        string metadataCID
    );
    event ContributionReceived(
        uint256 indexed campaignId,
        address indexed backer,
        uint256 amount,
        uint256 totalRaised
    );
    event CampaignFinalized(uint256 indexed campaignId, CampaignStatus status);
    event CampaignFailed(
        uint256 indexed campaignId,
        FailureReason reason,
        uint256 refundPool,
        uint256 failedAtMilestone
    );
    event MilestoneProofSubmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        string proofCID,
        uint64 voteStart,
        uint64 voteEnd
    );
    event VoteCast(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        address indexed voter,
        bool support,
        uint256 weight
    );
    event MilestoneExecuted(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        bool approved,
        uint256 approvedAmount,
        CampaignStatus campaignStatus
    );
    event CreatorWithdrawal(uint256 indexed campaignId, address indexed creator, uint256 amount);
    event RefundClaimed(uint256 indexed campaignId, address indexed backer, uint256 amount);

    modifier campaignExists(uint256 campaignId) {
        require(campaignId < campaignCount, "Campaign does not exist");
        _;
    }

    constructor(uint256 quorumBps_, uint256 votingDuration_) {
        require(quorumBps_ > 0 && quorumBps_ <= 10_000, "Invalid quorum");
        require(votingDuration_ > 0, "Invalid voting duration");

        quorumBps = quorumBps_;
        votingDuration = votingDuration_;
    }

    function createCampaign(
        uint256 goal,
        uint64 fundraisingDeadline,
        uint256[] calldata milestoneAmounts,
        uint64[] calldata milestoneDueDates,
        string calldata metadataCID
    ) external returns (uint256 campaignId) {
        require(goal > 0, "Goal must be greater than zero");
        require(fundraisingDeadline > block.timestamp, "Fundraising deadline must be in the future");
        require(bytes(metadataCID).length > 0, "Metadata CID is required");
        require(milestoneAmounts.length > 0, "At least one milestone is required");
        require(milestoneAmounts.length == milestoneDueDates.length, "Milestone arrays must match");

        uint256 totalMilestoneAmount;
        uint64 previousDueDate = fundraisingDeadline;

        for (uint256 index = 0; index < milestoneAmounts.length; index++) {
            require(milestoneAmounts[index] > 0, "Milestone amount must be greater than zero");
            require(milestoneDueDates[index] > previousDueDate, "Milestone due dates must be increasing");

            totalMilestoneAmount += milestoneAmounts[index];
            previousDueDate = milestoneDueDates[index];
        }

        require(totalMilestoneAmount == goal, "Milestone amounts must sum to goal");

        campaignId = campaignCount;
        campaignCount += 1;

        Campaign storage campaign = _campaigns[campaignId];
        campaign.creator = msg.sender;
        campaign.goal = goal;
        campaign.fundraisingDeadline = fundraisingDeadline;
        campaign.createdAt = uint64(block.timestamp);
        campaign.status = CampaignStatus.Fundraising;
        campaign.milestoneCount = milestoneAmounts.length;
        campaign.metadataCID = metadataCID;

        for (uint256 index = 0; index < milestoneAmounts.length; index++) {
            _milestones[campaignId].push(
                Milestone({
                    amount: milestoneAmounts[index],
                    dueDate: milestoneDueDates[index],
                    proofCID: "",
                    voteStart: 0,
                    voteEnd: 0,
                    yesWeight: 0,
                    noWeight: 0,
                    executed: false
                })
            );
        }

        emit CampaignCreated(campaignId, msg.sender, goal, fundraisingDeadline, metadataCID);
    }

    function contribute(uint256 campaignId) external payable nonReentrant campaignExists(campaignId) {
        Campaign storage campaign = _campaigns[campaignId];

        require(campaign.status == CampaignStatus.Fundraising, "Campaign is not fundraising");
        require(block.timestamp < campaign.fundraisingDeadline, "Fundraising period has ended");
        require(msg.sender != campaign.creator, "Creator cannot contribute");
        require(msg.value > 0, "Contribution must be greater than zero");

        uint256 remaining = campaign.goal - campaign.totalRaised;
        require(msg.value <= remaining, "Contribution exceeds remaining goal");

        campaign.totalRaised += msg.value;
        _contributions[campaignId][msg.sender] += msg.value;

        emit ContributionReceived(campaignId, msg.sender, msg.value, campaign.totalRaised);
    }

    function finalizeCampaign(uint256 campaignId) external campaignExists(campaignId) {
        Campaign storage campaign = _campaigns[campaignId];

        require(campaign.status == CampaignStatus.Fundraising, "Campaign already finalized");
        require(block.timestamp >= campaign.fundraisingDeadline, "Fundraising deadline not reached");

        if (campaign.totalRaised < campaign.goal) {
            _failCampaign(campaignId, FailureReason.Underfunded);
            return;
        }

        campaign.status = CampaignStatus.Active;
        emit CampaignFinalized(campaignId, CampaignStatus.Active);
    }

    function submitMilestoneProof(
        uint256 campaignId,
        uint256 milestoneId,
        string calldata proofCID
    ) external campaignExists(campaignId) {
        Campaign storage campaign = _campaigns[campaignId];

        require(msg.sender == campaign.creator, "Only the creator can submit proof");
        require(campaign.status == CampaignStatus.Active, "Campaign is not active");
        require(milestoneId == campaign.currentMilestone, "Milestone is not current");
        require(bytes(proofCID).length > 0, "Proof CID is required");

        Milestone storage milestone = _milestones[campaignId][milestoneId];

        require(bytes(milestone.proofCID).length == 0, "Proof already submitted");
        require(block.timestamp <= milestone.dueDate, "Milestone due date passed");

        uint64 voteStart = uint64(block.timestamp);
        uint64 voteEnd = uint64(block.timestamp + votingDuration);

        milestone.proofCID = proofCID;
        milestone.voteStart = voteStart;
        milestone.voteEnd = voteEnd;

        emit MilestoneProofSubmitted(campaignId, milestoneId, proofCID, voteStart, voteEnd);
    }

    function voteOnMilestone(
        uint256 campaignId,
        uint256 milestoneId,
        bool support
    ) external campaignExists(campaignId) {
        Campaign storage campaign = _campaigns[campaignId];

        require(campaign.status == CampaignStatus.Active, "Campaign is not active");
        require(msg.sender != campaign.creator, "Creator cannot vote");
        require(_contributions[campaignId][msg.sender] > 0, "Only backers can vote");
        require(milestoneId == campaign.currentMilestone, "Milestone is not current");

        Milestone storage milestone = _milestones[campaignId][milestoneId];
        VoteReceipt storage receipt = _voteReceipts[campaignId][milestoneId][msg.sender];

        require(bytes(milestone.proofCID).length > 0, "Proof not submitted");
        require(block.timestamp >= milestone.voteStart, "Voting has not started");
        require(block.timestamp < milestone.voteEnd, "Voting period has ended");
        require(!receipt.hasVoted, "Backer already voted");

        uint256 voteWeight = _contributions[campaignId][msg.sender];

        receipt.hasVoted = true;
        receipt.support = support;

        if (support) {
            milestone.yesWeight += voteWeight;
        } else {
            milestone.noWeight += voteWeight;
        }

        emit VoteCast(campaignId, milestoneId, msg.sender, support, voteWeight);
    }

    function executeMilestone(uint256 campaignId, uint256 milestoneId) external campaignExists(campaignId) {
        Campaign storage campaign = _campaigns[campaignId];

        require(campaign.status == CampaignStatus.Active, "Campaign is not active");
        require(milestoneId == campaign.currentMilestone, "Milestone is not current");

        Milestone storage milestone = _milestones[campaignId][milestoneId];

        require(bytes(milestone.proofCID).length > 0, "Proof not submitted");
        require(!milestone.executed, "Milestone already executed");
        require(block.timestamp >= milestone.voteEnd, "Voting period not ended");

        uint256 participationWeight = milestone.yesWeight + milestone.noWeight;
        bool quorumReached = participationWeight * 10_000 >= campaign.totalRaised * quorumBps;
        bool approved = quorumReached && milestone.yesWeight > milestone.noWeight;

        if (!approved) {
            _failCampaign(campaignId, FailureReason.VoteRejected);
            emit MilestoneExecuted(campaignId, milestoneId, false, 0, CampaignStatus.Failed);
            return;
        }

        milestone.executed = true;
        campaign.approvedPayoutTotal += milestone.amount;
        campaign.currentMilestone += 1;

        if (campaign.currentMilestone == campaign.milestoneCount) {
            campaign.status = CampaignStatus.Completed;
        }

        emit MilestoneExecuted(campaignId, milestoneId, true, milestone.amount, campaign.status);
    }

    function withdrawCreatorFunds(uint256 campaignId)
        external
        nonReentrant
        campaignExists(campaignId)
    {
        Campaign storage campaign = _campaigns[campaignId];

        require(msg.sender == campaign.creator, "Only the creator can withdraw");

        uint256 withdrawableAmount = campaign.approvedPayoutTotal - campaign.creatorWithdrawn;
        require(withdrawableAmount > 0, "No funds available");

        campaign.creatorWithdrawn += withdrawableAmount;
        payable(msg.sender).sendValue(withdrawableAmount);

        emit CreatorWithdrawal(campaignId, msg.sender, withdrawableAmount);
    }

    function claimRefund(uint256 campaignId) external nonReentrant campaignExists(campaignId) {
        Campaign storage campaign = _campaigns[campaignId];

        require(campaign.status == CampaignStatus.Failed, "Refunds are not available");
        require(_contributions[campaignId][msg.sender] > 0, "No contribution recorded");
        require(!_refundClaimed[campaignId][msg.sender], "Refund already claimed");

        uint256 refundAmount = getRefundAmount(campaignId, msg.sender);
        require(refundAmount > 0, "No refund available");

        _refundClaimed[campaignId][msg.sender] = true;
        payable(msg.sender).sendValue(refundAmount);

        emit RefundClaimed(campaignId, msg.sender, refundAmount);
    }

    function failCampaignForMissedDeadline(uint256 campaignId) external campaignExists(campaignId) {
        Campaign storage campaign = _campaigns[campaignId];

        require(campaign.status == CampaignStatus.Active, "Campaign is not active");

        Milestone storage milestone = _milestones[campaignId][campaign.currentMilestone];
        require(bytes(milestone.proofCID).length == 0, "Proof already submitted");
        require(block.timestamp > milestone.dueDate, "Milestone deadline not missed");

        _failCampaign(campaignId, FailureReason.MissedMilestoneDeadline);
    }

    function getCampaign(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (Campaign memory)
    {
        return _campaigns[campaignId];
    }

    function getMilestone(uint256 campaignId, uint256 milestoneId)
        external
        view
        campaignExists(campaignId)
        returns (Milestone memory)
    {
        require(milestoneId < _campaigns[campaignId].milestoneCount, "Milestone does not exist");
        return _milestones[campaignId][milestoneId];
    }

    function getContributionAmount(uint256 campaignId, address backer)
        external
        view
        campaignExists(campaignId)
        returns (uint256)
    {
        return _contributions[campaignId][backer];
    }

    function getVoteReceipt(
        uint256 campaignId,
        uint256 milestoneId,
        address voter
    ) external view campaignExists(campaignId) returns (bool hasVoted, bool support) {
        require(milestoneId < _campaigns[campaignId].milestoneCount, "Milestone does not exist");

        VoteReceipt memory receipt = _voteReceipts[campaignId][milestoneId][voter];
        return (receipt.hasVoted, receipt.support);
    }

    function getRefundAmount(uint256 campaignId, address backer)
        public
        view
        campaignExists(campaignId)
        returns (uint256)
    {
        Campaign storage campaign = _campaigns[campaignId];

        if (campaign.status != CampaignStatus.Failed || _refundClaimed[campaignId][backer]) {
            return 0;
        }

        uint256 contributionAmount = _contributions[campaignId][backer];
        if (contributionAmount == 0 || campaign.totalRaised == 0) {
            return 0;
        }

        return (contributionAmount * _getRefundPool(campaign)) / campaign.totalRaised;
    }

    function getBackerState(uint256 campaignId, address backer)
        external
        view
        campaignExists(campaignId)
        returns (uint256 contributionAmount, bool refundClaimed, uint256 refundAmount)
    {
        contributionAmount = _contributions[campaignId][backer];
        refundClaimed = _refundClaimed[campaignId][backer];
        refundAmount = getRefundAmount(campaignId, backer);
    }

    function getCreatorWithdrawable(uint256 campaignId)
        public
        view
        campaignExists(campaignId)
        returns (uint256)
    {
        Campaign storage campaign = _campaigns[campaignId];
        return campaign.approvedPayoutTotal - campaign.creatorWithdrawn;
    }

    function getRefundPool(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (uint256)
    {
        return _getRefundPool(_campaigns[campaignId]);
    }

    function _failCampaign(uint256 campaignId, FailureReason reason) internal {
        Campaign storage campaign = _campaigns[campaignId];
        campaign.status = CampaignStatus.Failed;
        campaign.failureReason = reason;

        emit CampaignFailed(campaignId, reason, _getRefundPool(campaign), campaign.currentMilestone);
    }

    function _getRefundPool(Campaign storage campaign) internal view returns (uint256) {
        return campaign.totalRaised - campaign.approvedPayoutTotal;
    }
}
