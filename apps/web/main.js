const RESET_MS = 1500;

for (const button of document.querySelectorAll("button.copy")) {
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(button.dataset.copy ?? "");
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Copy";
    }, RESET_MS);
  });
}
