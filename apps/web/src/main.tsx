import "./style.css";

const load = new URL(location.href).searchParams.has("study") ? import("./study-app") : import("./game-app");
void load.catch(error => {
  console.error("Kartsick could not load.", error);
  const root = document.getElementById("root");
  const heading = document.createElement("h1");
  heading.textContent = "Kartsick could not load.";
  const message = document.createElement("p");
  message.textContent = error instanceof Error ? error.message : String(error);
  const retry = document.createElement("button");
  retry.textContent = "Reload game";
  retry.onclick = () => location.reload();
  root?.replaceChildren(heading, message, retry);
});
