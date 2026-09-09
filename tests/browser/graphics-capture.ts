export function captureGraphicsFrame(canvas: HTMLCanvasElement, caption: string,
  labels: readonly { text: string; x: number; y: number }[] = []): string {
  const image = document.createElement("canvas");
  image.width = 1600; image.height = 900;
  const context = image.getContext("2d");
  if (!context) throw new Error("The graphics capture requires a 2D canvas.");
  context.drawImage(canvas, 0, 0, image.width, image.height);
  context.font = "17px monospace";
  for (const label of labels) {
    const width = context.measureText(label.text).width + 20;
    context.fillStyle = "#18251bdd";
    context.fillRect(label.x - width / 2, label.y - 21, width, 30);
    context.fillStyle = "#fff";
    context.fillText(label.text, label.x - width / 2 + 10, label.y);
  }
  context.fillStyle = "#18251bdd";
  context.fillRect(0, 861, 1600, 39);
  context.fillStyle = "#fff";
  context.fillText(caption, 18, 886);
  return image.toDataURL("image/png");
}
