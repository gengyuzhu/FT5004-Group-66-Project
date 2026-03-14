const state = {
  walletConnected: false,
  network: "Localhost",
  filter: "All",
  selectedCampaignId: 2,
  activity: [
    "Preview booted from the repository site.",
    "Campaign state is now grouped by milestone actions and refund visibility.",
  ],
};

const campaigns = [
  {
    id: 1,
    title: "Open Source Design System",
    summary: "Ship a reusable component library with two audited milestone releases.",
    creator: "0xA1B2...9F10",
    status: "Fundraising",
    goal: 12,
    raised: 7.5,
    currentMilestone: 0,
    refundPool: 7.5,
    milestones: [
      { title: "Publish alpha package", amount: 5, due: "May 12", yes: 0, no: 0, proof: false, executed: false },
      { title: "Release audited v1", amount: 7, due: "Jun 04", yes: 0, no: 0, proof: false, executed: false },
    ],
  },
  {
    id: 2,
    title: "Climate Sensor Field Kit",
    summary: "Crowdfund a milestone-based hardware sprint for a portable climate monitor.",
    creator: "0xC3D4...7E88",
    status: "Active",
    goal: 18,
    raised: 18,
    currentMilestone: 0,
    refundPool: 18,
    milestones: [
      { title: "Prototype enclosure", amount: 6, due: "Apr 21", yes: 9, no: 2, proof: true, executed: false },
      { title: "Pilot hardware batch", amount: 12, due: "May 30", yes: 0, no: 0, proof: false, executed: false },
    ],
  },
  {
    id: 3,
    title: "Campus Mental Health Toolkit",
    summary: "A creator team building multilingual self-help packs with milestone-based evidence drops.",
    creator: "0xF8E9...1234",
    status: "Completed",
    goal: 10,
    raised: 10,
    currentMilestone: 2,
    refundPool: 0,
    milestones: [
      { title: "Content research sprint", amount: 4, due: "Mar 14", yes: 7, no: 1, proof: true, executed: true },
      { title: "Final release and translation pack", amount: 6, due: "Apr 08", yes: 8, no: 0, proof: true, executed: true },
    ],
  },
];

const networkOptions = ["Localhost", "Sepolia"];
const filterOptions = ["All", "Fundraising", "Active", "Completed", "Failed"];

const campaignGrid = document.getElementById("campaign-grid");
const detailTitle = document.getElementById("detail-title");
const detailStatus = document.getElementById("detail-status");
const detailSummary = document.getElementById("detail-summary");
const milestoneList = document.getElementById("milestone-list");
const actionStack = document.getElementById("action-stack");
const activityList = document.getElementById("activity-list");
const phoneScreen = document.getElementById("phone-screen");
const walletToggle = document.getElementById("wallet-toggle");
const walletState = document.getElementById("wallet-state");
const networkSwitcher = document.getElementById("network-switcher");
const filterSwitcher = document.getElementById("filter-switcher");

function getStatusClass(status) {
  switch (status) {
    case "Fundraising":
      return "status-fundraising";
    case "Active":
      return "status-active";
    case "Completed":
      return "status-completed";
    case "Failed":
      return "status-failed";
    default:
      return "status-default";
  }
}

function appendActivity(message) {
  state.activity.unshift(message);
  state.activity = state.activity.slice(0, 8);
}

function selectedCampaign() {
  return campaigns.find((campaign) => campaign.id === state.selectedCampaignId) ?? campaigns[0];
}

function progress(campaign) {
  return Math.min((campaign.raised / campaign.goal) * 100, 100);
}

function renderSwitchers() {
  networkSwitcher.innerHTML = networkOptions
    .map(
      (option) =>
        `<button class="chip ${state.network === option ? "active" : ""}" data-network="${option}">${option}</button>`,
    )
    .join("");

  filterSwitcher.innerHTML = filterOptions
    .map(
      (option) =>
        `<button class="chip ${state.filter === option ? "active" : ""}" data-filter="${option}">${option}</button>`,
    )
    .join("");
}

function renderCampaigns() {
  const filtered = campaigns.filter(
    (campaign) => state.filter === "All" || campaign.status === state.filter,
  );

  campaignGrid.innerHTML = filtered
    .map(
      (campaign) => `
        <article class="campaign-card ${campaign.id === state.selectedCampaignId ? "active" : ""}" data-campaign-id="${campaign.id}">
          <div class="campaign-head">
            <span class="status-pill ${getStatusClass(campaign.status)}">${campaign.status}</span>
            <span class="meta-note">#${campaign.id}</span>
          </div>
          <h3>${campaign.title}</h3>
          <p>${campaign.summary}</p>
          <div class="quick-facts">
            <div><span class="meta-label">Raised</span><span class="meta-value">${campaign.raised} ETH</span></div>
            <div><span class="meta-label">Goal</span><span class="meta-value">${campaign.goal} ETH</span></div>
            <div><span class="meta-label">Creator</span><span class="meta-value">${campaign.creator}</span></div>
            <div><span class="meta-label">Milestones</span><span class="meta-value">${campaign.milestones.length}</span></div>
          </div>
          <div class="progress"><span style="width:${progress(campaign)}%"></span></div>
        </article>
      `,
    )
    .join("");
}

function renderDetail() {
  const campaign = selectedCampaign();
  const currentMilestone =
    campaign.milestones[Math.min(campaign.currentMilestone, campaign.milestones.length - 1)] ?? null;

  detailTitle.textContent = campaign.title;
  detailStatus.textContent = campaign.status;
  detailStatus.className = `status-pill ${getStatusClass(campaign.status)}`;

  detailSummary.innerHTML = `
    <div class="section-header">
      <div>
        <p class="eyebrow">Campaign overview</p>
        <h3>${campaign.summary}</h3>
      </div>
      <span class="status-pill ${getStatusClass(campaign.status)}">${campaign.status}</span>
    </div>
    <div class="summary-grid">
      <div><span class="meta-label">Creator</span><span class="meta-value">${campaign.creator}</span></div>
      <div><span class="meta-label">Escrowed</span><span class="meta-value">${campaign.raised} ETH / ${campaign.goal} ETH</span></div>
      <div><span class="meta-label">Refund pool</span><span class="meta-value">${campaign.refundPool} ETH</span></div>
      <div><span class="meta-label">Current milestone</span><span class="meta-value">${Math.min(campaign.currentMilestone + 1, campaign.milestones.length)} / ${campaign.milestones.length}</span></div>
    </div>
    <div class="progress"><span style="width:${progress(campaign)}%"></span></div>
  `;

  milestoneList.innerHTML = campaign.milestones
    .map((milestone, index) => {
      const badge = milestone.executed
        ? ["Approved", "status-completed"]
        : milestone.proof
          ? ["Voting open", "status-active"]
          : index === campaign.currentMilestone
            ? ["Current", "status-fundraising"]
            : ["Queued", "status-default"];

      return `
        <article class="milestone-item">
          <div class="milestone-head">
            <div>
              <p class="eyebrow">Milestone ${index + 1}</p>
              <h4>${milestone.title}</h4>
            </div>
            <span class="status-pill ${badge[1]}">${badge[0]}</span>
          </div>
          <div class="milestone-meta">
            <div><span class="meta-label">Amount</span><span class="meta-value">${milestone.amount} ETH</span></div>
            <div><span class="meta-label">Due</span><span class="meta-value">${milestone.due}</span></div>
            <div><span class="meta-label">YES</span><span class="meta-value">${milestone.yes} ETH</span></div>
            <div><span class="meta-label">NO</span><span class="meta-value">${milestone.no} ETH</span></div>
          </div>
        </article>
      `;
    })
    .join("");

  renderActions(campaign, currentMilestone);
  renderActivity();
  renderPhone(campaign, currentMilestone);
}

function renderActions(campaign, currentMilestone) {
  const cards = [];

  if (campaign.status === "Fundraising") {
    cards.push(`
      <div class="action-box">
        <p class="eyebrow">Fundraising controls</p>
        <strong>${campaign.raised.toFixed(1)} ETH raised</strong>
        <p>Backers can still contribute. Finalization moves the campaign into milestone execution.</p>
        <div class="action-buttons">
          <button class="button" data-action="contribute">Add 0.5 ETH</button>
          <button class="button button-secondary" data-action="finalize">Finalize</button>
        </div>
      </div>
    `);
  }

  if (campaign.status === "Active" && currentMilestone && !currentMilestone.proof) {
    cards.push(`
      <div class="action-box">
        <p class="eyebrow">Proof controls</p>
        <strong>${currentMilestone.title}</strong>
        <p>The creator can submit proof and open the weighted vote window for this milestone.</p>
        <div class="action-buttons">
          <button class="button" data-action="submit-proof">Submit proof</button>
          <button class="button button-ghost" data-action="miss-deadline">Missed deadline</button>
        </div>
      </div>
    `);
  }

  if (campaign.status === "Active" && currentMilestone && currentMilestone.proof && !currentMilestone.executed) {
    cards.push(`
      <div class="action-box">
        <p class="eyebrow">Voting controls</p>
        <strong>${currentMilestone.yes} YES / ${currentMilestone.no} NO</strong>
        <p>Contribution-weighted votes decide whether this tranche becomes creator-withdrawable.</p>
        <div class="action-buttons">
          <button class="button" data-action="vote-yes">Vote YES</button>
          <button class="button button-secondary" data-action="vote-no">Vote NO</button>
          <button class="button button-ghost" data-action="execute">Execute</button>
        </div>
      </div>
    `);
  }

  if (campaign.status === "Failed") {
    cards.push(`
      <div class="action-box">
        <p class="eyebrow">Refund flow</p>
        <strong>${campaign.refundPool.toFixed(1)} ETH refundable</strong>
        <p>Backers reclaim only unreleased escrow. Approved payouts stay outside the refund pool.</p>
        <div class="action-buttons">
          <button class="button" data-action="claim-refund">Claim refund</button>
        </div>
      </div>
    `);
  }

  if (campaign.status === "Completed") {
    cards.push(`
      <div class="action-box">
        <p class="eyebrow">Completed state</p>
        <strong>All milestones passed</strong>
        <p>The creator can finish withdrawing approved tranches while the campaign remains publicly auditable.</p>
      </div>
    `);
  }

  actionStack.innerHTML = cards.join("");
}

function renderActivity() {
  activityList.innerHTML = state.activity
    .map(
      (item) => `
        <article class="activity-item">
          <strong>${item}</strong>
          <p>Static interaction updated locally inside the GitHub Pages showcase.</p>
        </article>
      `,
    )
    .join("");
}

function renderPhone(campaign, currentMilestone) {
  phoneScreen.innerHTML = `
    <div class="mini-card">
      <span class="eyebrow">Campaign</span>
      <strong>${campaign.title}</strong>
      <p>${campaign.status} | ${campaign.raised}/${campaign.goal} ETH</p>
    </div>
    <div class="mini-card">
      <span class="eyebrow">Current milestone</span>
      <strong>${currentMilestone ? currentMilestone.title : "Completed"}</strong>
      <p>${currentMilestone ? `${currentMilestone.yes} YES / ${currentMilestone.no} NO` : "No pending vote"}</p>
    </div>
    <div class="mini-card">
      <span class="eyebrow">Wallet</span>
      <strong>${state.walletConnected ? "Connected" : "Offline"}</strong>
      <p>${state.network}</p>
    </div>
  `;
}

function handleAction(action) {
  const campaign = selectedCampaign();
  const currentMilestone = campaign.milestones[campaign.currentMilestone];

  switch (action) {
    case "contribute":
      campaign.raised = Math.min(campaign.goal, Number((campaign.raised + 0.5).toFixed(1)));
      campaign.refundPool = campaign.raised;
      appendActivity(`Backer contributed 0.5 ETH to campaign ${campaign.id}.`);
      break;
    case "finalize":
      campaign.status = campaign.raised >= campaign.goal ? "Active" : "Failed";
      appendActivity(
        campaign.status === "Active"
          ? `Campaign ${campaign.id} finalized and entered milestone execution.`
          : `Campaign ${campaign.id} missed its goal and opened refunds.`,
      );
      break;
    case "submit-proof":
      if (currentMilestone) {
        currentMilestone.proof = true;
        appendActivity(`Creator submitted proof for milestone ${campaign.currentMilestone + 1}.`);
      }
      break;
    case "vote-yes":
      if (currentMilestone) {
        currentMilestone.yes = Number((currentMilestone.yes + 1.5).toFixed(1));
        appendActivity(`A backer cast a YES vote on milestone ${campaign.currentMilestone + 1}.`);
      }
      break;
    case "vote-no":
      if (currentMilestone) {
        currentMilestone.no = Number((currentMilestone.no + 1).toFixed(1));
        appendActivity(`A backer cast a NO vote on milestone ${campaign.currentMilestone + 1}.`);
      }
      break;
    case "execute":
      if (currentMilestone) {
        const quorumReached = currentMilestone.yes + currentMilestone.no >= campaign.raised * 0.2;
        const votePassed = quorumReached && currentMilestone.yes > currentMilestone.no;

        if (votePassed) {
          currentMilestone.executed = true;
          campaign.refundPool = Number((campaign.refundPool - currentMilestone.amount).toFixed(1));
          campaign.currentMilestone += 1;
          campaign.status = campaign.currentMilestone >= campaign.milestones.length ? "Completed" : "Active";
          appendActivity(`Milestone execution passed for campaign ${campaign.id}.`);
        } else {
          campaign.status = "Failed";
          appendActivity(`Milestone execution failed and refunds opened for campaign ${campaign.id}.`);
        }
      }
      break;
    case "miss-deadline":
      campaign.status = "Failed";
      appendActivity(`Campaign ${campaign.id} failed after the active milestone deadline was missed.`);
      break;
    case "claim-refund":
      appendActivity(`Backer claimed a proportional refund from campaign ${campaign.id}.`);
      break;
    default:
      break;
  }

  render();
}

function render() {
  walletState.textContent = state.walletConnected ? `Wallet connected on ${state.network}` : "Wallet offline";
  walletState.className = `status-pill ${state.walletConnected ? "status-active" : "status-default"}`;
  walletToggle.textContent = state.walletConnected ? "Disconnect Wallet" : "Connect Wallet";

  renderSwitchers();
  renderCampaigns();
  renderDetail();
}

walletToggle.addEventListener("click", () => {
  state.walletConnected = !state.walletConnected;
  appendActivity(
    state.walletConnected ? "Mock wallet connected in the repository preview." : "Mock wallet disconnected.",
  );
  render();
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const campaignCard = target.closest("[data-campaign-id]");
  if (campaignCard instanceof HTMLElement) {
    state.selectedCampaignId = Number(campaignCard.dataset.campaignId);
    render();
    return;
  }

  if (target.dataset.network) {
    state.network = target.dataset.network;
    appendActivity(`Preview network switched to ${state.network}.`);
    render();
    return;
  }

  if (target.dataset.filter) {
    state.filter = target.dataset.filter;
    render();
    return;
  }

  if (target.dataset.action) {
    handleAction(target.dataset.action);
  }
});

render();
