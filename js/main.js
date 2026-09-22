const searchForm = document.getElementById("cryptoSearch");
const searchInput = document.getElementById("searchInput");

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const query = searchInput.value.trim();
  if (!query) {
    searchInput.focus();
    return;
  }

  const coinId = query.toLowerCase().replace(/\\s+/g, "-");
  window.location.href = `crypto.html?coin=${encodeURIComponent(coinId)}`;
});

document.querySelectorAll(".coin-link").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.href = `crypto.html?coin=${encodeURIComponent(button.dataset.coin)}`;
  });
});
