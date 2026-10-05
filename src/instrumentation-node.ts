const g = globalThis as unknown as { __painelRejeicoes?: boolean };
if (!g.__painelRejeicoes) {
  g.__painelRejeicoes = true;
  process.on("unhandledRejection", (motivo) => {
    console.error("[rejeição não tratada]", motivo instanceof Error ? `${motivo.message}\n${motivo.stack ?? ""}` : motivo);
  });
}
export {};
