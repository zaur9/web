const ONE_ETH_WEI = "0xde0b6b3a7640000";
const MAINNET = "0x1";
const MIN_DONATION_ETH = 0.5;

const form = document.getElementById("age-form");
const birthInput = document.getElementById("birthdate");
const modal = document.getElementById("pay-modal");
const payKicker = document.getElementById("pay-kicker");
const payTitle = document.getElementById("pay-title");
const payDesc = document.getElementById("pay-desc");
const payError = document.getElementById("pay-error");
const payStatus = document.getElementById("pay-status");
const payConfirm = document.getElementById("pay-confirm");
const payClose = document.getElementById("pay-close");
const agePrice = document.getElementById("age-price");
const donateWrap = document.getElementById("donate-amount-wrap");
const donateInput = document.getElementById("donate-amount");
const resultSection = document.getElementById("result-section");
const resultText = document.getElementById("result-text");
const resultExtra = document.getElementById("result-extra");

let pending = null;

function receiver() {
  const raw = window.SITE_CONFIG?.recipientAddress?.trim() || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) return "";
  return raw;
}

function showError(message) {
  payError.hidden = false;
  payError.textContent = message;
}

function showStatus(message) {
  payStatus.hidden = false;
  payStatus.textContent = message;
}

function ethToWeiHex(amountEth) {
  const text = String(amountEth).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error("Enter a valid ETH amount.");
  }
  const [whole, frac = ""] = text.split(".");
  const wei = BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
  return `0x${wei.toString(16)}`;
}

function readDonationEth() {
  const amount = Number(donateInput.value);
  if (!Number.isFinite(amount) || amount < MIN_DONATION_ETH) {
    throw new Error("Donation must be at least 0.5 ETH.");
  }
  return amount;
}

function openPayModal(kind, reason) {
  pending = { kind, reason, birthdate: birthInput.value };
  payError.hidden = true;
  payStatus.hidden = true;
  payConfirm.disabled = false;

  if (kind === "age") {
    payKicker.textContent = "age checkout";
    payTitle.textContent = "Unlock your age";
    payDesc.textContent =
      "You entered a birth date. Confirm 1 ETH in your wallet and the chronology engine will run.";
    agePrice.hidden = false;
    donateWrap.hidden = true;
    payConfirm.textContent = "pay 1 ETH now";
  } else {
    payKicker.textContent = "construction donation";
    payTitle.textContent = "Help finish this website";
    payDesc.textContent =
      "There is a hole in the page. Choose how much ETH to send. Minimum 0.5.";
    agePrice.hidden = true;
    donateWrap.hidden = false;
    donateInput.value = donateInput.value || "0.5";
    payConfirm.textContent = "send donation";
  }

  modal.hidden = false;
}

function closePayModal() {
  modal.hidden = true;
}

function ageBreakdown(isoDate) {
  const birth = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  if (Number.isNaN(birth.getTime()) || birth > now) {
    throw new Error("That date is not a past birthday.");
  }

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();

  if (days < 0) {
    const previousMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += previousMonth.getDate();
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }

  const totalDays = Math.floor((now - birth) / 86400000);
  return { years, months, days, totalDays };
}

function revealAge(isoDate) {
  const age = ageBreakdown(isoDate);
  resultSection.hidden = false;
  resultText.textContent = `You are ${age.years} years, ${age.months} months, and ${age.days} days old.`;
  resultExtra.textContent = `That is ${age.totalDays} days of being a person. Thank you for the 1 ETH.`;
  resultSection.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function ensureMainnet() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId === MAINNET) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MAINNET }],
    });
  } catch (error) {
    throw new Error("Switch your wallet to Ethereum mainnet, then try again.");
  }
}

async function waitForReceipt(txHash) {
  for (let i = 0; i < 90; i += 1) {
    const receipt = await window.ethereum.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    });
    if (receipt) {
      if (receipt.status === "0x1") return receipt;
      throw new Error("The transaction failed on-chain. No age for you.");
    }
    showStatus(`Waiting for Ethereum… ${i + 1}/90`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for the transaction. Check your wallet activity.");
}

async function sendEth(valueHex, label) {
  const to = receiver();
  if (!to) {
    throw new Error(
      "Site owner still has PASTE_YOUR_ETH_ADDRESS_HERE in config.js. Cannot take your ETH yet."
    );
  }
  if (!window.ethereum) {
    throw new Error("No Ethereum wallet found in this browser. Install one, then come back.");
  }

  showStatus("Connecting wallet…");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0]) throw new Error("Wallet did not return an account.");

  await ensureMainnet();
  showStatus(`Confirm ${label} in your wallet…`);

  const txHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: accounts[0],
        to,
        value: valueHex,
      },
    ],
  });

  showStatus(`Sent. Tx ${txHash}. Waiting for confirmation…`);
  await waitForReceipt(txHash);
  return txHash;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!birthInput.value) {
    birthInput.reportValidity();
    return;
  }
  try {
    ageBreakdown(birthInput.value);
  } catch (error) {
    birthInput.setCustomValidity(error.message);
    birthInput.reportValidity();
    birthInput.setCustomValidity("");
    return;
  }
  openPayModal("age", "age-calculator");
});

document.querySelectorAll("[data-pay='donate']").forEach((el) => {
  el.addEventListener("click", () => {
    openPayModal("donate", el.dataset.reason || "donate");
  });
});

payClose.addEventListener("click", closePayModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closePayModal();
});

payConfirm.addEventListener("click", async () => {
  payError.hidden = true;
  payConfirm.disabled = true;
  try {
    let valueHex = ONE_ETH_WEI;
    let label = "1 ETH";
    if (pending?.kind === "donate") {
      const amount = readDonationEth();
      valueHex = ethToWeiHex(amount);
      label = `${amount} ETH`;
    }
    await sendEth(valueHex, label);
    showStatus("Payment confirmed on Ethereum.");
    if (pending?.kind === "age") {
      revealAge(pending.birthdate);
    } else {
      resultSection.hidden = false;
      resultText.textContent = "Thank you. The hole is still a hole, but it is a funded hole.";
      resultExtra.textContent = `Donation: ${label}.`;
      resultSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(closePayModal, 900);
  } catch (error) {
    const message = error?.message || "Payment did not go through.";
    if (error?.code === 4001) {
      showError("You rejected the payment. The years remain a mystery.");
    } else {
      showError(message);
    }
    payConfirm.disabled = false;
  }
});
