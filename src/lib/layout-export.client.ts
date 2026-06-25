import "@tanstack/react-start/client-only";

interface ExportLayoutOptions {
  node: HTMLElement;
  filename: string;
  width: number;
  height: number;
}

export async function exportLayoutAsPng({ node, filename }: ExportLayoutOptions) {
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(node, { backgroundColor: "#ffffff", pixelRatio: 2 });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${filename}.png`;
  link.click();
}

export async function exportLayoutAsPdf({ node, filename, width, height }: ExportLayoutOptions) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const dataUrl = await toPng(node, { backgroundColor: "#ffffff", pixelRatio: 2 });
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [width, height] });
  pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
  pdf.save(`${filename}.pdf`);
}