const searchForm = document.getElementById("cryptoSearch");
const searchInput = document.getElementById("searchInput");

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) {
    searchInput.focus();
    return;
  }
  window.location.href = `crypto.html?coin=${encodeURIComponent(query)}`;
});

document.querySelectorAll(".coin-link").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.href = `crypto.html?coin=${encodeURIComponent(button.dataset.coin)}`;
  });
});

const marketCoins = ["bitcoin", "ethereum", "solana", "binancecoin"];
const marketCards = document.querySelectorAll(".market-card");

async function loadMarketSnapshot() {
  try {
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" +
      marketCoins.join(",") + "&order=market_cap_desc&per_page=4&page=1&sparkline=false";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Market API request failed");
    const coins = await response.json();

    coins.forEach((coin, index) => {
      const card = marketCards[index];
      if (!card) return;
      const price = coin.current_price;
      const change = coin.price_change_percentage_24h;
      card.querySelector("strong").textContent = price == null ? "$--" : "$" + price.toLocaleString(undefined, {maximumSignificantDigits: 7});
      const changeEl = card.querySelector(".change");
      changeEl.textContent = change == null ? "--" : (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
      changeEl.style.color = change >= 0 ? "var(--green)" : "#ff5c5c";
    });
  } catch (error) {
    console.error("Gugee market snapshot:", error);
  }
}

loadMarketSnapshot();
