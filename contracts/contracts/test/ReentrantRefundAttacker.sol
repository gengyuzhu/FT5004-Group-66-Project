// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MilestoneVault} from "../MilestoneVault.sol";

contract ReentrantRefundAttacker {
    MilestoneVault public immutable vault;
    uint256 public targetCampaignId;
    bool public reentryAttempted;
    bool public reentryBlocked;

    constructor(address vaultAddress) {
        vault = MilestoneVault(vaultAddress);
    }

    function contributeToCampaign(uint256 campaignId) external payable {
        targetCampaignId = campaignId;
        vault.contribute{value: msg.value}(campaignId);
    }

    function attackClaimRefund(uint256 campaignId) external {
        targetCampaignId = campaignId;
        vault.claimRefund(campaignId);
    }

    receive() external payable {
        if (!reentryAttempted) {
            reentryAttempted = true;

            try vault.claimRefund(targetCampaignId) {
                reentryBlocked = false;
            } catch {
                reentryBlocked = true;
            }
        }
    }
}
